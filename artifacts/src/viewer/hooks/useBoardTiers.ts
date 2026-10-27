import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { renderBoardPlaceholder } from '../../shared/thumbnail';
import { isMediaBoard, type BoardSpec } from '../../shared/types';
import { boardsToWarm, chooseTiers, snapshotScale, type BoardRender } from '../lib/board-tiers';
import { boardReady } from '../lib/play';
import { createSnapshotStore, snapshotKey, type SnapshotStore } from '../lib/snapshot-store';
import { createTierController } from '../lib/tier-controller';
import type { View } from '../lib/view';

const CAPTURE_TIMEOUT_MS = 10_000;
let sharedStore: SnapshotStore | null = null;

function useColorScheme() {
  const query = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const [dark, setDark] = useState(!!query?.matches);
  useEffect(() => {
    if (!query) return;
    const change = () => setDark(query.matches);
    query.addEventListener?.('change', change);
    return () => query.removeEventListener?.('change', change);
  }, [query]);
  return dark ? 'dark' as const : 'light' as const;
}

export function useBoardTiers({ artifact, boards, versions, pending, view, scaling, viewport, pinned, hovered, hoverPromotes, persistable, store: provided }: {
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
  store?: SnapshotStore;
}) {
  const store = provided ?? (sharedStore ??= createSnapshotStore());
  const [, bump] = useReducer((count: number) => count + 1, 0);
  const failed = useRef(new Set<string>());
  const [controller] = useState(() => createTierController({
    onChange: bump,
    onGiveUp: (id) => {
      const key = keysRef.current.get(id);
      if (key) failed.current.add(key);
    },
  }));
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const scheme = useColorScheme();
  const frames = useRef(new Map<string, HTMLIFrameElement>());
  const reported = useRef(new Set<string>());
  const refs = useRef(new Map<string, (element: HTMLIFrameElement | null) => void>());

  const html = boards.filter(([id, board]) => !isMediaBoard(board) && boardReady(versions, board.file) && !pending.has(id));
  const keys = new Map(html.map(([id, board]) => [id, snapshotKey({ artifact, file: board.file, version: versions[board.file] ?? 0, scheme, w: board.w, h: board.h })]));
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

  const snapshots = new Set([...keys].filter(([, key]) => store.has(key) && !store.isUnsupported(key)).map(([id]) => id));
  const tierBoards = html.map(([id, board]) => ({ id, x: board.x, y: board.y, w: board.w, h: board.h }));
  const unsupported = new Set([...keys].filter(([, key]) => store.isUnsupported(key) || failed.current.has(key)).map(([id]) => id));
  const warm = scaling ? [] : boardsToWarm({ boards: tierBoards, view, viewport, snapshots, skip: unsupported });
  const states = controller.update({ boards: tierBoards, view, viewport, pinned, snapshots, scaling, hovered, hoverPromotes, warm });
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
      if (urls[id]?.name === name || requested.current.has(name) || exhausted.current.has(name)) continue;
      requested.current.add(name);
      void store.url(key, scale).then((url) => {
        requested.current.delete(name);
        if (url && broken.current.has(url)) exhausted.current.add(name);
        else if (url) setUrls((previous) => (previous[id]?.name === name ? previous : { ...previous, [id]: { name, url } }));
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

  const placeholders = useMemo(() => new Map(boards.map(([id, board]) => [id, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderBoardPlaceholder({ id, title: board.title, w: board.w, h: board.h }))}`])), [boards]);

  const queue = useRef<string[]>([]);
  const inflight = useRef<{ id: string; key: string; request: number; timer: number } | null>(null);
  const nextRequest = useRef(0);
  const pump = useCallback(() => {
    if (inflight.current || scalingRef.current) return;
    while (queue.current.length) {
      const id = queue.current.shift()!;
      const target = frames.current.get(id)?.contentWindow;
      const key = keysRef.current.get(id);
      if (!target || !key || store.isUnsupported(key)) continue;
      const request = ++nextRequest.current;
      const timer = window.setTimeout(() => {
        if (inflight.current?.request !== request) return;
        failed.current.add(key);
        inflight.current = null;
        bump();
        pump();
      }, CAPTURE_TIMEOUT_MS);
      inflight.current = { id, key, request, timer };
      target.postMessage({ type: 'ryugi:board:capture', request, scale: dpr }, '*');
      return;
    }
  }, [store, dpr]);
  const pumpRef = useRef(pump);
  pumpRef.current = pump;
  useEffect(() => { if (!scaling) pump(); }, [scaling, pump]);
  useEffect(() => () => { if (inflight.current) window.clearTimeout(inflight.current.timer); }, []);

  useEffect(() => {
    const capture = (id: string) => {
      if (!queue.current.includes(id)) queue.current.push(id);
      pump();
    };
    const onMessage = (event: MessageEvent) => {
      const type = event.data?.type;
      if (typeof type !== 'string' || !type.startsWith('ryugi:board:')) return;
      const id = [...frames.current].find(([, element]) => element.contentWindow === event.source)?.[0];
      if (!id) return;
      if (type === 'ryugi:board:ready') {
        reported.current.add(id);
        controller.ready(id);
        capture(id);
      } else if (type === 'ryugi:board:changed') {
        if (reported.current.has(id)) capture(id);
      } else if (type === 'ryugi:board:snapshot') {
        const current = inflight.current;
        if (!current || current.id !== id || event.data.request !== current.request) return;
        window.clearTimeout(current.timer);
        inflight.current = null;
        const { blob, width, height } = event.data as { blob?: unknown; width?: unknown; height?: unknown };
        if (blob instanceof Blob && typeof width === 'number' && typeof height === 'number') {
          void store.put(current.key, { blob, width, height, scale: dpr }, { persist: persistableRef.current(id) });
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
    if (!refs.current.has(id)) refs.current.set(id, (element) => {
      if (element) {
        frames.current.set(id, element);
        return;
      }
      frames.current.delete(id);
      reported.current.delete(id);
      queue.current = queue.current.filter((queued) => queued !== id);
      if (inflight.current?.id !== id) return;
      window.clearTimeout(inflight.current.timer);
      inflight.current = null;
      pumpRef.current();
    });
    return refs.current.get(id)!;
  }, []);
  const loaded = useCallback((id: string) => {
    reported.current.delete(id);
    controller.loaded(id);
  }, [controller]);

  const media = boards.filter(([, board]) => isMediaBoard(board));
  const mediaTiers = chooseTiers({ boards: media.map(([id, board]) => ({ id, x: board.x, y: board.y, w: board.w, h: board.h })), view, viewport, pinned: new Set(), snapshots: new Set(media.map(([id]) => id)) });
  const renders = new Map<string, BoardRender>();
  for (const [id, tier] of mediaTiers) renders.set(id, { tier, mounted: false, image: null, overlay: false, hidden: false });
  for (const [id, state] of states) {
    const key = keys.get(id)!;
    const resolved = urls[id];
    const snapshot = snapshots.has(id) && resolved?.name.startsWith(`${key}#`) ? resolved.url : null;
    const image = state.tier === 'empty' ? null : snapshot ?? placeholders.get(id) ?? null;
    renders.set(id, {
      tier: state.tier,
      mounted: state.mounted,
      image,
      overlay: state.mounted && (!state.ready || !!state.warming || (scaling && !!snapshot)),
      hidden: state.mounted && (!!state.warming || (state.ready && scaling && !!snapshot)),
    });
  }
  return { renders, frameRef, loaded, imageFailed };
}
