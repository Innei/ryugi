import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { renderBoardPlaceholder } from '../../shared/thumbnail';
import { type BoardSpec, isMediaBoard } from '../../shared/types';
import { type BoardRender, boardsToWarm, chooseTiers, snapshotScale } from '../lib/board-tiers';
import { liveLimit } from '../lib/live-limit';
import { boardReady } from '../lib/play';
import { createSnapshotStore, snapshotKey, type SnapshotStore } from '../lib/snapshot-store';
import { createTierController } from '../lib/tier-controller';
import type { View } from '../lib/view';

const CAPTURE_TIMEOUT_MS = 10_000;
const CAPTURE_CONCURRENCY = 2;
const PREVIEW_LIVE_LIMIT = 4;
let sharedStore: SnapshotStore | null = null;

function useColorScheme() {
  const query =
    typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const [dark, setDark] = useState(!!query?.matches);
  useEffect(() => {
    if (!query) return;
    const change = () => setDark(query.matches);
    query.addEventListener?.('change', change);
    return () => query.removeEventListener?.('change', change);
  }, [query]);
  return dark ? ('dark' as const) : ('light' as const);
}

export function useBoardTiers({
  artifact,
  boards,
  versions,
  pending,
  view,
  scaling,
  viewport,
  pinned,
  hovered,
  hoverPromotes,
  persistable,
  preview = false,
  store: provided,
}: {
  artifact: string;
  boards: [string, BoardSpec][];
  versions: Record<string, number>;
  pending: ReadonlySet<string>;
  view: View;
  scaling: boolean;
  viewport: { width: number; height: number };
  pinned: ReadonlySet<string>;
  hovered: string | null;
  hoverPromotes: boolean;
  persistable: (id: string) => boolean;
  preview?: boolean;
  store?: SnapshotStore;
}) {
  const store = provided ?? (sharedStore ??= createSnapshotStore());
  const [, bump] = useReducer((count: number) => count + 1, 0);
  const failed = useRef(new Set<string>());
  const [controller] = useState(() =>
    createTierController({
      onChange: bump,
      onGiveUp: (id) => {
        const key = keysRef.current.get(id);
        if (key) failed.current.add(key);
      },
    }),
  );
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  // A phone preview is looked at, not pixel-peeped; capping the raster scale roughly halves capture time and memory.
  const captureScale = preview ? Math.min(dpr, 2) : dpr;
  const scheme = useColorScheme();
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const reported = useRef(new Set<string>());
  const timedOut = useRef(new Set<string>());
  const refs = useRef(new Map<string, (element: HTMLIFrameElement | null) => void>());

  const html = boards.filter(
    ([id, board]) => !isMediaBoard(board) && boardReady(versions, board.file) && !pending.has(id),
  );
  const keys = new Map(
    html.map(([id, board]) => [
      id,
      snapshotKey({
        artifact,
        file: board.file,
        version: versions[board.file] ?? 0,
        scheme,
        w: board.w,
        h: board.h,
      }),
    ]),
  );
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const persistableRef = useRef(persistable);
  persistableRef.current = persistable;
  const scalingRef = useRef(scaling);
  scalingRef.current = scaling;

  useEffect(() => store.subscribe(() => bump()), [store]);
  const loading = useRef(new Set<string>());
  useEffect(() => {
    for (const key of keys.values()) {
      if (store.has(key) || loading.current.has(key)) continue;
      loading.current.add(key);
      void store.load(key);
    }
  });

  const snapshots = new Set(
    [...keys].filter(([, key]) => store.has(key) && !store.isUnsupported(key)).map(([id]) => id),
  );
  const tierBoards = html.map(([id, board]) => ({
    id,
    x: board.x,
    y: board.y,
    w: board.w,
    h: board.h,
  }));
  const unsupported = new Set(
    [...keys]
      .filter(([, key]) => store.isUnsupported(key) || failed.current.has(key))
      .map(([id]) => id),
  );
  const warm = scaling
    ? []
    : boardsToWarm({
        boards: tierBoards,
        view,
        viewport,
        snapshots,
        skip: unsupported,
        // A phone overview draws boards only tens of pixels wide; still warm them so the page fills in.
        minWidth: preview ? 32 : undefined,
      });
  const nav = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined;
  const limit = preview
    ? PREVIEW_LIVE_LIMIT
    : liveLimit({
        device: { cores: nav?.hardwareConcurrency, memoryGB: nav?.deviceMemory },
        viewport,
      });
  const states = controller.update({
    boards: tierBoards,
    limit,
    maxMounting: preview ? PREVIEW_LIVE_LIMIT : undefined,
    untilSnapshot: preview,
    view,
    viewport,
    pinned,
    snapshots,
    scaling,
    hovered,
    hoverPromotes,
    warm,
  });
  const settledK = useRef(view.k);
  if (!scaling) settledK.current = view.k;
  const scale = snapshotScale(settledK.current, dpr);

  const [urls, setUrls] = useState<Record<string, { name: string; url: string }>>({});
  const requested = useRef(new Set<string>());
  const broken = useRef(new Set<string>());
  const exhausted = useRef(new Set<string>());
  useEffect(() => {
    for (const [id, key] of keys) {
      const state = states.get(id);
      if (!snapshots.has(id) || !(state?.tier === 'snapshot' || state?.mounted)) continue;
      const name = `${key}#${store.revision(key)}@${scale}`;
      if (urls[id]?.name === name || requested.current.has(name) || exhausted.current.has(name))
        continue;
      requested.current.add(name);
      void store.url(key, scale).then((url) => {
        requested.current.delete(name);
        if (url && broken.current.has(url)) exhausted.current.add(name);
        else if (url)
          setUrls((previous) =>
            previous[id]?.name === name ? previous : { ...previous, [id]: { name, url } },
          );
      });
    }
  });
  const imageFailed = useCallback((id: string, url: string) => {
    if (!url.startsWith('blob:')) return;
    broken.current.add(url);
    setUrls((previous) => {
      if (previous[id]?.url !== url) return previous;
      const { [id]: _, ...rest } = previous;
      return rest;
    });
  }, []);

  const placeholders = useMemo(
    () =>
      new Map(
        boards.map(([id, board]) => [
          id,
          `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderBoardPlaceholder({ id, title: board.title, w: board.w, h: board.h }))}`,
        ]),
      ),
    [boards],
  );

  const queue = useRef<string[]>([]);
  const inflight = useRef(new Map<string, { key: string; request: number; timer: number }>());
  const nextRequest = useRef(0);
  const pump = useCallback(() => {
    if (scalingRef.current) return;
    while (inflight.current.size < CAPTURE_CONCURRENCY && queue.current.length) {
      const id = queue.current.shift()!;
      if (inflight.current.has(id)) continue;
      const target = frames.current.get(id)?.contentWindow;
      const key = keysRef.current.get(id);
      if (!target || !key || store.isUnsupported(key)) continue;
      const request = ++nextRequest.current;
      const timer = window.setTimeout(() => {
        const current = inflight.current.get(id);
        if (!current || current.request !== request) return;
        inflight.current.delete(id);
        failed.current.add(key);
        timedOut.current.add(id);
        bump();
        pump();
      }, CAPTURE_TIMEOUT_MS);
      inflight.current.set(id, { key, request, timer });
      target.postMessage({ type: 'ryugi:board:capture', request, scale: captureScale }, '*');
    }
  }, [store, captureScale]);
  const pumpRef = useRef(pump);
  pumpRef.current = pump;
  useEffect(() => {
    if (!scaling) pump();
  }, [scaling, pump]);
  useEffect(
    () => () => {
      for (const { timer } of inflight.current.values()) window.clearTimeout(timer);
      inflight.current.clear();
    },
    [],
  );

  useEffect(() => {
    const capture = (id: string) => {
      if (timedOut.current.has(id)) return;
      if (!queue.current.includes(id)) queue.current.push(id);
      pump();
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (typeof type !== 'string' || !type.startsWith('ryugi:board:')) return;
      const id = [...frames.current].find(
        ([, element]) => element.contentWindow === event.source,
      )?.[0];
      if (!id) return;
      if (type === 'ryugi:board:ready') {
        reported.current.add(id);
        controller.ready(id);
        capture(id);
      } else if (type === 'ryugi:board:changed') {
        if (reported.current.has(id)) capture(id);
      } else if (type === 'ryugi:board:snapshot') {
        const current = inflight.current.get(id);
        if (!current || event.data.request !== current.request) return;
        window.clearTimeout(current.timer);
        inflight.current.delete(id);
        const { blob, width, height } = event.data as {
          blob?: unknown;
          width?: unknown;
          height?: unknown;
        };
        if (blob instanceof Blob && typeof width === 'number' && typeof height === 'number') {
          void store.put(
            current.key,
            { blob, width, height, scale: captureScale },
            { persist: persistableRef.current(id) },
          );
        } else {
          store.markUnsupported(current.key);
          bump();
        }
        pump();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [controller, pump, store, dpr]);

  const frameRef = useCallback((id: string) => {
    if (!refs.current.has(id))
      refs.current.set(id, (element) => {
        if (element) {
          frames.current.set(id, element);
          return;
        }
        frames.current.delete(id);
        reported.current.delete(id);
        timedOut.current.delete(id);
        queue.current = queue.current.filter((queued) => queued !== id);
        const current = inflight.current.get(id);
        if (!current) return;
        window.clearTimeout(current.timer);
        inflight.current.delete(id);
        pumpRef.current();
      });
    return refs.current.get(id)!;
  }, []);
  const loaded = useCallback(
    (id: string) => {
      reported.current.delete(id);
      timedOut.current.delete(id);
      controller.loaded(id);
    },
    [controller],
  );

  const media = boards.filter(([, board]) => isMediaBoard(board));
  const mediaTiers = chooseTiers({
    boards: media.map(([id, board]) => ({ id, x: board.x, y: board.y, w: board.w, h: board.h })),
    limit,
    view,
    viewport,
    pinned: new Set(),
    snapshots: new Set(media.map(([id]) => id)),
  });
  const renders = new Map<string, BoardRender>();
  for (const [id, tier] of mediaTiers)
    renders.set(id, { tier, mounted: false, image: null, overlay: false, hidden: false });
  for (const [id, state] of states) {
    const key = keys.get(id)!;
    const resolved = urls[id];
    const snapshot =
      snapshots.has(id) && resolved?.name.startsWith(`${key}#`) ? resolved.url : null;
    const image = state.tier === 'empty' ? null : (snapshot ?? placeholders.get(id) ?? null);
    renders.set(id, {
      tier: state.tier,
      mounted: state.mounted,
      image,
      // Never scale a live iframe: during a gesture the frame is covered by its
      // snapshot, or its placeholder when no snapshot exists yet. A live frame
      // that has not reported ready stays visible so an occluding placeholder
      // cannot throttle its own first paint.
      overlay:
        state.mounted && (!!state.warming || scaling || (state.tier !== 'live' && !state.ready)),
      hidden: state.mounted && (!!state.warming || scaling),
    });
  }
  return { renders, frameRef, loaded, imageFailed };
}
