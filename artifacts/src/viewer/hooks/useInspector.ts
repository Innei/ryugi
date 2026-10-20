import { useCallback, useEffect, useRef, useState } from 'react';
import type { InspectorCommand, InspectorNode, InspectorProperty, InspectorRect, InspectorReport, InspectorSelection, InspectorTarget, InspectorTweak } from '../../shared/inspector';
import { readInspectorReport } from '../lib/inspector';

export interface InspectedFrame { session: string; nodes: InspectorNode[]; truncated: boolean; tweaks: InspectorTweak[] }
export interface InspectedSelection { boardId: string; node: InspectorSelection }
export type InspectorInput = Extract<InspectorReport, { type: 'ryugi:inspect:wheel' | 'ryugi:inspect:pan' | 'ryugi:inspect:key' | 'ryugi:inspect:drag' }>;
interface Options { enabled: boolean; playing: ReadonlySet<string>; onInput: (boardId: string, input: InspectorInput) => void }
interface RegisteredFrame { element: HTMLIFrameElement; connection: string; session: string | null }
interface Target extends InspectorTarget { boardId: string }
interface State { frames: Record<string, InspectedFrame>; selection: InspectedSelection | null; targets: Target[]; previewTargets: Target[] | null; hover: { boardId: string; rect: InspectorRect } | null }
type Command = InspectorCommand extends infer T ? T extends InspectorCommand ? Omit<T, 'type' | 'connection'> : never : never;

export function useInspector(options: Options) {
  const [state, setState] = useState<State>({ frames: {}, selection: null, targets: [], previewTargets: null, hover: null });
  const current = useRef({ options, state });
  current.current = { options, state };
  const registered = useRef(new Map<string, RegisteredFrame>());
  const refs = useRef(new Map<string, (element: HTMLIFrameElement | null) => void>());
  const sequence = useRef(0);
  const area = useRef<{ request: number; waiting: Set<string>; base: Target[]; results: Map<string, Target[]>; preview: boolean } | null>(null);
  const send = useCallback((boardId: string, command: Command) => {
    const entry = registered.current.get(boardId);
    entry?.element.contentWindow?.postMessage({ type: 'ryugi:inspect', connection: entry.connection, session: entry.session, ...command }, '*');
  }, []);
  const invalidate = useCallback((boardId: string) => {
    area.current = null;
    setState((previous) => {
      const frames = { ...previous.frames }; delete frames[boardId];
      return { frames, previewTargets: null, targets: previous.targets.filter((target) => target.boardId !== boardId), selection: previous.selection?.boardId === boardId ? null : previous.selection, hover: previous.hover?.boardId === boardId ? null : previous.hover };
    });
  }, []);
  const refFor = useCallback((boardId: string) => {
    if (!refs.current.has(boardId)) refs.current.set(boardId, (element) => {
      if (registered.current.get(boardId)?.element === element) return;
      if (!element) { send(boardId, { action: 'disable' }); registered.current.delete(boardId); invalidate(boardId); }
      else registered.current.set(boardId, { element, connection: crypto.randomUUID(), session: null });
    });
    return refs.current.get(boardId)!;
  }, [invalidate, send]);
  const loaded = useCallback((boardId: string) => {
    const entry = registered.current.get(boardId);
    if (!entry) return;
    entry.connection = crypto.randomUUID(); entry.session = null;
    invalidate(boardId);
    const { enabled, playing } = current.current.options;
    if (enabled && !playing.has(boardId)) send(boardId, { action: 'enable' });
  }, [invalidate, send]);

  useEffect(() => {
    const message = (event: MessageEvent) => {
      const match = Array.from(registered.current).find(([, entry]) => entry.element.contentWindow === event.source);
      if (!match) return;
      const [boardId, entry] = match;
      const data = readInspectorReport(event.data);
      if (!data || data.connection !== entry.connection || (entry.session !== null && entry.session !== data.session)) return;
      if (!current.current.options.enabled && data.type !== 'ryugi:inspect:tweaks') return;
      if (current.current.options.playing.has(boardId) && data.type !== 'ryugi:inspect:tweaks') return;
      if (data.type === 'ryugi:inspect:tree') {
        entry.session = data.session;
        const ids = new Set(data.nodes.map((node) => node.id));
        setState((previous) => ({ ...previous, targets: previous.targets.filter((target) => target.boardId !== boardId || ids.has(target.id)), selection: previous.selection?.boardId === boardId && !ids.has(previous.selection.node.id) ? null : previous.selection, frames: { ...previous.frames, [boardId]: { session: data.session, nodes: data.nodes, truncated: data.truncated, tweaks: previous.frames[boardId]?.tweaks ?? [] } } }));
        return;
      }
      if (entry.session === null) return;
      if (data.type === 'ryugi:inspect:selection') {
        if (data.reason === 'user' || data.reason === 'command') area.current = null;
        setState((previous) => {
          const node = data.selection;
          if (data.reason === 'primary' || data.reason === 'update') {
            if (!node) return previous;
            const primary = previous.targets.at(-1);
            if (!primary || primary.boardId !== boardId || primary.id !== node.id) return previous;
            return { ...previous, selection: { boardId, node }, targets: previous.targets.map((target) => target.boardId === boardId && target.id === node.id ? { ...target, name: node.name || node.selector, rect: node.rect } : target) };
          }
          if (!node) return previous;
          const existing = previous.targets.some((target) => target.boardId === boardId && target.id === node.id);
          const target = { boardId, id: node.id, name: node.name || node.selector, rect: node.rect };
          const targets = data.toggle ? existing ? previous.targets.filter((item) => item.boardId !== boardId || item.id !== node.id) : [...previous.targets, target] : [target];
          return { ...previous, targets, previewTargets: null, selection: data.toggle && existing ? null : { boardId, node } };
        });
      } else if (data.type === 'ryugi:inspect:targets') {
        const pending = area.current;
        if (!pending || data.request !== pending.request || !pending.waiting.delete(boardId)) return;
        pending.results.set(boardId, data.targets.map((target) => ({ ...target, boardId })));
        if (pending.waiting.size) return;
        const targets = [...pending.base];
        for (const result of pending.results.values()) for (const target of result) if (!targets.some((item) => item.boardId === target.boardId && item.id === target.id)) targets.push(target);
        setState((previous) => pending.preview ? { ...previous, previewTargets: targets } : { ...previous, targets, previewTargets: null, selection: null });
      } else if (data.type === 'ryugi:inspect:hover') {
        setState((previous) => ({ ...previous, hover: data.rect ? { boardId, rect: data.rect } : null }));
      } else if (data.type === 'ryugi:inspect:rect') {
        setState((previous) => ({ ...previous, targets: previous.targets.map((target) => target.boardId === boardId && target.id === data.id ? { ...target, rect: data.rect } : target), selection: previous.selection?.boardId === boardId && previous.selection.node.id === data.id ? { boardId, node: { ...previous.selection.node, rect: data.rect } } : previous.selection }));
      } else if (data.type === 'ryugi:inspect:tweaks') {
        setState((previous) => previous.frames[boardId] ? { ...previous, frames: { ...previous.frames, [boardId]: { ...previous.frames[boardId], tweaks: data.tweaks } } } : previous);
      } else current.current.options.onInput(boardId, data);
    };
    window.addEventListener('message', message);
    const frames = registered.current;
    return () => { window.removeEventListener('message', message); for (const boardId of frames.keys()) send(boardId, { action: 'disable' }); };
  }, [send]);

  const playingKey = Array.from(options.playing).sort().join('\0');
  useEffect(() => {
    area.current = null;
    for (const boardId of registered.current.keys()) send(boardId, { action: options.enabled && !current.current.options.playing.has(boardId) ? 'enable' : 'disable' });
    setState((previous) => {
      const playingSelection = previous.selection && current.current.options.playing.has(previous.selection.boardId);
      return { ...previous, previewTargets: null, targets: previous.targets.filter((target) => !current.current.options.playing.has(target.boardId)), hover: null, selection: playingSelection ? null : previous.selection };
    });
  }, [options.enabled, playingKey, send]);

  const targetKey = JSON.stringify(state.targets.map(({ boardId, id }) => [boardId, id]));
  useEffect(() => {
    if (!options.enabled) return;
    for (const boardId of registered.current.keys()) if (!current.current.options.playing.has(boardId)) send(boardId, { action: 'track', ids: current.current.state.targets.filter((target) => target.boardId === boardId).map((target) => target.id) });
  }, [targetKey, options.enabled, playingKey, send]);
  useEffect(() => {
    const primary = state.targets.at(-1);
    if (options.enabled && primary && (state.selection?.boardId !== primary.boardId || state.selection.node.id !== primary.id)) send(primary.boardId, { action: 'select', id: primary.id, primary: true });
  }, [targetKey, state.selection, options.enabled, send]);
  const clearSelection = useCallback(() => { area.current = null; setState((previous) => ({ ...previous, targets: [], previewTargets: null, selection: null, hover: null })); }, []);
  const cancelDrag = useCallback(() => {
    if (area.current?.preview) area.current = null;
    setState((previous) => previous.previewTargets ? { ...previous, previewTargets: null } : previous);
    for (const boardId of registered.current.keys()) send(boardId, { action: 'cancel-drag' });
  }, [send]);
  const selectArea = useCallback((areas: { boardId: string; rect: InspectorRect }[], append: boolean, preview = false) => {
    const { options, state } = current.current;
    if (!options.enabled) return;
    const ready = areas.filter(({ boardId }) => registered.current.get(boardId)?.session && !options.playing.has(boardId));
    const base = append ? state.targets : [];
    area.current = { request: ++sequence.current, waiting: new Set(ready.map(({ boardId }) => boardId)), base, results: new Map(), preview };
    setState((previous) => preview
      ? { ...previous, previewTargets: ready.length ? previous.previewTargets ?? base : base, hover: null }
      : { ...previous, targets: ready.length ? previous.previewTargets ?? base : base, previewTargets: null, selection: append ? previous.selection : null, hover: null });
    for (const { boardId, rect } of ready) send(boardId, { action: 'marquee', request: sequence.current, rect });
  }, [send]);
  const select = useCallback((boardId: string, id: number, toggle = false) => {
    if (!current.current.options.enabled || current.current.options.playing.has(boardId)) return;
    area.current = null;
    send(boardId, { action: 'select', id, toggle });
  }, [send]);
  const hoverNode = useCallback((boardId: string, id: number | null) => {
    if (current.current.options.enabled && !current.current.options.playing.has(boardId)) send(boardId, { action: 'hover', id });
  }, [send]);
  const change = useCallback((property: InspectorProperty, value: string) => {
    const { state, options } = current.current;
    const selection = state.selection;
    if (!selection || !options.enabled || options.playing.has(selection.boardId)) return;
    const session = state.frames[selection.boardId]?.session;
    if (session) send(selection.boardId, { action: 'style', id: selection.node.id, property, value, session });
  }, [send]);
  const reset = useCallback(() => { for (const boardId of registered.current.keys()) send(boardId, { action: 'reset' }); }, [send]);

  return { ...state, targets: state.previewTargets ?? state.targets, refFor, loaded, select, selectArea, clearSelection, cancelDrag, hoverNode, change, reset };
}

export type Inspector = ReturnType<typeof useInspector>;
