import { useCallback, useEffect, useState } from 'react';
import type { ServerMessage } from '../../shared/types';
import { mergePayload, type ViewerPayload } from '../lib/payload';

const EMPTY: ViewerPayload = { canvas: null, warnings: [], layout: null, versions: {}, boardBase: '', stale: false };

export function useCanvasData() {
  const [data, setData] = useState<ViewerPayload>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/canvas', { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()) as Omit<ViewerPayload, 'stale'>;
      setData((prev) => mergePayload(prev, next));
      setLoaded(true);
    } catch {
      setLive(false);
    }
  }, []);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const connect = () => {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      socket.onopen = () => {
        setLive(true);
        void refresh();
      };
      socket.onclose = () => {
        setLive(false);
        if (!disposed) retry = setTimeout(connect, 1000);
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === 'change') void refresh();
      };
    };

    void refresh();
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [refresh]);

  return { ...data, loaded, live };
}
