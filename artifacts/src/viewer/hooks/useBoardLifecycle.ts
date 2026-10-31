import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { type BoardSpec, isMediaBoard } from '../../shared/types';
import {
  type BoardPhase,
  createBoardLifecycle,
  type LifecycleOutput,
} from '../lib/board-lifecycle';
import { boardReady } from '../lib/play';
import type { View } from '../lib/view';

const CAPTURE_SCALE_MAX = 2;

interface Options {
  active: ReadonlySet<string>;
  boards: [string, BoardSpec][];
  gesturing: boolean;
  pending: ReadonlySet<string>;
  versions: Record<string, number>;
  view: View;
  viewport: { width: number; height: number };
}

const EMPTY: LifecycleOutput = {
  phases: new Map(),
  capture: [],
  uncapturable: new Set(),
  wakeAt: null,
};

function sameOutput(a: LifecycleOutput, b: LifecycleOutput) {
  if (a.phases.size !== b.phases.size || a.uncapturable.size !== b.uncapturable.size) return false;
  for (const [id, phase] of a.phases) if (b.phases.get(id) !== phase) return false;
  for (const id of a.uncapturable) if (!b.uncapturable.has(id)) return false;
  return true;
}

export function useBoardLifecycle({
  boards,
  versions,
  pending,
  view,
  viewport,
  active,
  gesturing,
}: Options) {
  const controller = useMemo(() => createBoardLifecycle(), []);
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const refs = useRef(new Map<string, (element: HTMLIFrameElement | null) => void>());
  const requests = useRef(new Map<string, { request: number; version: number }>());
  const nextRequest = useRef(0);
  const [images, setImages] = useState<ReadonlyMap<string, string>>(() => new Map());
  const imagesRef = useRef(images);
  imagesRef.current = images;
  const [output, setOutput] = useState(EMPTY);
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((value) => value + 1), []);

  const tracked = useMemo(
    () =>
      boards
        .filter(
          ([id, board]) =>
            !isMediaBoard(board) && boardReady(versions, board.file) && !pending.has(id),
        )
        .map(([id, board]) => ({
          id,
          x: board.x,
          y: board.y,
          w: board.w,
          h: board.h,
          version: versions[board.file] ?? 0,
        })),
    [boards, versions, pending],
  );

  useEffect(() => {
    const out = controller.update({ boards: tracked, view, viewport, active, gesturing });
    setOutput((previous) => (sameOutput(previous, out) ? previous : out));
    const scale = Math.min(CAPTURE_SCALE_MAX, window.devicePixelRatio || 1);
    for (const id of out.capture) {
      const version = tracked.find((board) => board.id === id)?.version ?? 0;
      const request = ++nextRequest.current;
      requests.current.set(id, { request, version });
      // A culled board is display:none until the capturing phase renders; a frame that loaded hidden reports a 0x0 window, so ask once it is laid out.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (requests.current.get(id)?.request !== request) return;
          frames.current
            .get(id)
            ?.contentWindow?.postMessage({ type: 'ryugi:board:capture', request, scale }, '*');
        }),
      );
    }
    if (out.wakeAt === null) return;
    const timer = setTimeout(bump, Math.max(0, out.wakeAt - performance.now()));
    return () => clearTimeout(timer);
  }, [controller, tracked, view, viewport, active, gesturing, tick, bump]);

  useEffect(() => {
    const ids = new Set(tracked.map((board) => board.id));
    const gone = [...imagesRef.current.keys()].filter((id) => !ids.has(id));
    if (!gone.length) return;
    setImages((previous) => {
      const next = new Map(previous);
      for (const id of gone) {
        URL.revokeObjectURL(next.get(id)!);
        next.delete(id);
      }
      return next;
    });
  }, [tracked]);

  useEffect(
    () => () => {
      for (const url of imagesRef.current.values()) URL.revokeObjectURL(url);
    },
    [],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (typeof type !== 'string' || !type.startsWith('ryugi:board:')) return;
      const id = [...frames.current].find(
        ([, element]) => element.contentWindow === event.source,
      )?.[0];
      if (!id) return;
      if (type === 'ryugi:board:ready') {
        controller.ready(id);
        bump();
      } else if (type === 'ryugi:board:interacted' || type === 'ryugi:board:changed') {
        controller.touch(id);
      } else if (type === 'ryugi:board:snapshot') {
        const pendingRequest = requests.current.get(id);
        if (!pendingRequest || event.data.request !== pendingRequest.request) return;
        requests.current.delete(id);
        const { blob, width, height } = event.data as {
          blob?: unknown;
          width?: unknown;
          height?: unknown;
        };
        const ok =
          blob instanceof Blob &&
          typeof width === 'number' &&
          typeof height === 'number' &&
          width > 0 &&
          height > 0;
        if (ok) {
          const url = URL.createObjectURL(blob);
          setImages((previous) => {
            const next = new Map(previous);
            const old = next.get(id);
            if (old) URL.revokeObjectURL(old);
            next.set(id, url);
            return next;
          });
        }
        controller.captured(id, { version: pendingRequest.version, ok });
        bump();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [controller, bump]);

  const frameRef = useCallback((id: string) => {
    let ref = refs.current.get(id);
    if (!ref) {
      ref = (element) => {
        if (element) frames.current.set(id, element);
        else {
          frames.current.delete(id);
          requests.current.delete(id);
        }
      };
      refs.current.set(id, ref);
    }
    return ref;
  }, []);

  const counts = useMemo(() => {
    const byPhase: Record<BoardPhase, number> = {
      mounted: 0,
      capturing: 0,
      unloaded: 0,
      restoring: 0,
    };
    for (const phase of output.phases.values()) byPhase[phase]++;
    return { ...byPhase, uncapturable: output.uncapturable.size };
  }, [output]);

  return { phases: output.phases, images, frameRef, counts };
}
