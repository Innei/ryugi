import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerMessage } from '../../shared/types';

export function useArtifactSocket(onMessage: (message: ServerMessage) => void, onOpen?: () => void) {
  const [live, setLive] = useState(false);
  const handlers = useRef({ onMessage, onOpen });
  const socketRef = useRef<WebSocket | null>(null);
  handlers.current = { onMessage, onOpen };

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const connect = () => {
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      socketRef.current = socket;
      socket.onopen = () => {
        setLive(true);
        handlers.current.onOpen?.();
      };
      socket.onclose = () => {
        setLive(false);
        if (!disposed) retry = setTimeout(connect, 1000);
      };
      socket.onmessage = (event) => handlers.current.onMessage(JSON.parse(String(event.data)) as ServerMessage);
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, []);

  const send = useCallback((message: unknown) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }, []);

  return { live, send };
}
