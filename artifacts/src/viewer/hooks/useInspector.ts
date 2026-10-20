import { useCallback, useEffect, useRef, useState } from 'react';
import type { InspectorCommand, InspectorNode, InspectorProperty, InspectorRect, InspectorReport, InspectorSelection, InspectorTweak } from '../../shared/inspector';
import { readInspectorReport } from '../lib/inspector';

export interface InspectedFrame { session: string; nodes: InspectorNode[]; truncated: boolean; tweaks: InspectorTweak[] }
export interface InspectedSelection { boardId: string; node: InspectorSelection }
export type InspectorInput = Extract<InspectorReport, { type: 'ryugi:inspect:wheel' | 'ryugi:inspect:pan' | 'ryugi:inspect:key' }>;
interface Options { enabled: boolean; playing: ReadonlySet<string>; onInput: (boardId: string, input: InspectorInput) => void }
interface RegisteredFrame { element: HTMLIFrameElement; connection: string; session: string | null }
interface State { frames: Record<string, InspectedFrame>; selection: InspectedSelection | null; hover: { boardId: string; rect: InspectorRect } | null }
type Command = InspectorCommand extends infer T ? T extends InspectorCommand ? Omit<T, 'type' | 'connection'> : never : never;

export function useInspector(options: Options) {
  const [state, setState] = useState<State>({ frames: {}, selection: null, hover: null });
  const current = useRef({ options, state });
  current.current = { options, state };
  const registered = useRef(new Map<string, RegisteredFrame>());
  const refs = useRef(new Map<string, (element: HTMLIFrameElement | null) => void>());
  const pendingSelection = useRef(false);
  const send = useCallback((boardId: string, command: Command) => {
    const entry = registered.current.get(boardId);
    entry?.element.contentWindow?.postMessage({ type: 'ryugi:inspect', connection: entry.connection, session: entry.session, ...command }, '*');
  }, []);
  const invalidate = useCallback((boardId: string) => {
    if (current.current.state.selection?.boardId === boardId) pendingSelection.current = false;
    setState((previous) => {
      const frames = { ...previous.frames }; delete frames[boardId];
      return { frames, selection: previous.selection?.boardId === boardId ? null : previous.selection, hover: previous.hover?.boardId === boardId ? null : previous.hover };
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
        setState((previous) => ({ ...previous, frames: { ...previous.frames, [boardId]: { session: data.session, nodes: data.nodes, truncated: data.truncated, tweaks: previous.frames[boardId]?.tweaks ?? [] } } }));
        if (!current.current.state.selection && !pendingSelection.current && data.nodes[0]) {
          pendingSelection.current = true;
          send(boardId, { action: 'select', id: data.nodes[0].id });
        }
        return;
      }
      if (entry.session === null) return;
      if (data.type === 'ryugi:inspect:selection') {
        pendingSelection.current = false;
        setState((previous) => {
          if (data.reason === 'update' && previous.selection?.boardId !== boardId) return previous;
          return { ...previous, selection: data.selection ? { boardId, node: data.selection } : null };
        });
      } else if (data.type === 'ryugi:inspect:hover') {
        setState((previous) => ({ ...previous, hover: data.rect ? { boardId, rect: data.rect } : null }));
      } else if (data.type === 'ryugi:inspect:rect') {
        setState((previous) => previous.selection?.boardId === boardId && previous.selection.node.id === data.id ? { ...previous, selection: { boardId, node: { ...previous.selection.node, rect: data.rect } } } : previous);
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
    for (const boardId of registered.current.keys()) send(boardId, { action: options.enabled && !current.current.options.playing.has(boardId) ? 'enable' : 'disable' });
    setState((previous) => {
      const playingSelection = previous.selection && current.current.options.playing.has(previous.selection.boardId);
      if (!previous.hover && !playingSelection) return previous;
      return { ...previous, hover: null, selection: playingSelection ? null : previous.selection };
    });
  }, [options.enabled, playingKey, send]);

  const select = useCallback((boardId: string, id: number) => {
    if (!current.current.options.enabled || current.current.options.playing.has(boardId)) return;
    send(boardId, { action: 'select', id });
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

  return { ...state, refFor, loaded, select, hoverNode, change, reset };
}

export type Inspector = ReturnType<typeof useInspector>;
