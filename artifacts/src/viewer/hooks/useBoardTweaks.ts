import { useCallback, useEffect, useRef, useState } from 'react';

import {
  readTweakSchema,
  readTweakValues,
  reconcileTweakValues,
  type TweakDeclaration,
  type TweakValue,
  type TweakValues,
} from '../../shared/tweaks';

export interface BoardTweakState extends TweakDeclaration {
  values: TweakValues;
}
interface Frame {
  boardId: string;
  connection: string;
  element: HTMLIFrameElement;
  session: string | null;
}

export function useBoardTweaks(artifact: string) {
  const current = useRef<Record<string, BoardTweakState>>({});
  const [states, setStates] = useState(current.current);
  const frames = useRef(new Map<string, Frame>());
  const refs = useRef(new Map<string, (element: HTMLIFrameElement | null) => void>());
  const publish = useCallback((boardId: string, next: BoardTweakState) => {
    current.current = { ...current.current, [boardId]: next };
    setStates(current.current);
  }, []);
  const send = useCallback((boardId: string, values: TweakValues) => {
    for (const frame of frames.current.values())
      if (frame.boardId === boardId && frame.session) {
        frame.element.contentWindow?.postMessage(
          {
            type: 'ryugi:tweaks',
            action: 'set',
            connection: frame.connection,
            session: frame.session,
            values,
          },
          '*',
        );
      }
  }, []);

  useEffect(() => {
    current.current = {};
    setStates({});
    for (const frame of frames.current.values()) {
      frame.connection = crypto.randomUUID();
      frame.session = null;
    }
  }, [artifact]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (
        !data ||
        data.type !== 'ryugi:tweaks:ready' ||
        typeof data.session !== 'string' ||
        !data.session ||
        data.session.length > 128
      )
        return;
      const frame = [...frames.current.values()].find(
        (entry) =>
          entry.element.contentWindow === event.source && entry.connection === data.connection,
      );
      if (!frame || (frame.session && frame.session !== data.session)) return;
      if (data.error !== null && (typeof data.error !== 'string' || data.error.length > 512))
        return;
      frame.session = data.session;
      const declaration = readTweakSchema(data.schema);
      if (data.error) {
        declaration.schema = null;
        declaration.error = data.error;
      }
      const previous = current.current[frame.boardId];
      const values = declaration.schema
        ? reconcileTweakValues(declaration.schema, previous?.values, previous?.schema ?? undefined)
        : {};
      publish(frame.boardId, { ...declaration, values });
      if (declaration.schema) send(frame.boardId, values);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [publish, send]);

  const refFor = useCallback((boardId: string, slot = 'canvas') => {
    const key = `${slot}:${boardId}`;
    if (!refs.current.has(key))
      refs.current.set(key, (element) => {
        if (!element) frames.current.delete(key);
        else if (frames.current.get(key)?.element !== element)
          frames.current.set(key, {
            boardId,
            element,
            connection: crypto.randomUUID(),
            session: null,
          });
      });
    return refs.current.get(key)!;
  }, []);
  const loaded = useCallback((boardId: string, slot = 'canvas') => {
    const frame = frames.current.get(`${slot}:${boardId}`);
    if (!frame) return;
    frame.connection = crypto.randomUUID();
    frame.session = null;
    frame.element.contentWindow?.postMessage(
      { type: 'ryugi:tweaks', action: 'connect', connection: frame.connection },
      '*',
    );
  }, []);
  const update = useCallback(
    (boardId: string, values: TweakValues) => {
      const state = current.current[boardId];
      const next = state?.schema && readTweakValues(state.schema, values);
      if (!state || !next) return;
      publish(boardId, { ...state, values: next });
      send(boardId, next);
    },
    [publish, send],
  );
  const change = useCallback(
    (boardId: string, key: string, value: TweakValue) => {
      update(boardId, { ...current.current[boardId]?.values, [key]: value });
    },
    [update],
  );
  const reset = useCallback(
    (boardId: string) => {
      const schema = current.current[boardId]?.schema;
      if (schema) update(boardId, reconcileTweakValues(schema));
    },
    [update],
  );
  return { states, refFor, loaded, change, reset };
}
