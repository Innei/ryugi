import type { Duplex } from 'node:stream';
import { completeHandshake, handleClientFrames, textFrame } from './ws';

interface DirectRelayOptions {
  version: string;
  handle: (key: string, body: unknown, conn: string) => Promise<unknown>;
  onActivity: () => void;
  onClose: (conn: string) => void;
}

export function createDirectRelay(options: DirectRelayOptions) {
  const sockets = new Map<Duplex, { key: string; conn: string }>();
  let opened = 0;
  const write = (socket: Duplex, message: unknown) =>
    socket.write(textFrame(JSON.stringify(message)));

  const onText = async (socket: Duplex, key: string, conn: string, text: string) => {
    let message: { t?: unknown; rid?: unknown; body?: unknown };
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (
      message.t !== 'request' ||
      (typeof message.rid !== 'number' && typeof message.rid !== 'string')
    )
      return;
    options.onActivity();
    try {
      write(socket, {
        t: 'reply',
        rid: message.rid,
        body: { ok: true, data: await options.handle(key, message.body, conn) },
      });
    } catch (err) {
      write(socket, {
        t: 'reply',
        rid: message.rid,
        body: { ok: false, error: (err as Error).message },
      });
    }
  };

  return {
    accept(socket: Duplex, clientKey: string, key: string) {
      completeHandshake(socket, clientKey);
      const conn = `direct:${++opened}`;
      sockets.set(socket, { key, conn });
      write(socket, { t: 'presence', online: true, version: options.version });
      handleClientFrames(socket, (text) => void onText(socket, key, conn, text));
      const forget = () => {
        if (sockets.delete(socket)) options.onClose(conn);
      };
      socket.on('end', () => {
        forget();
        socket.end();
      });
      socket.on('close', forget);
      socket.on('error', forget);
      options.onActivity();
    },
    emit(key: string, body: unknown) {
      for (const [socket, entry] of sockets)
        if (entry.key === key) write(socket, { t: 'event', body });
    },
    close() {
      for (const socket of sockets.keys()) socket.destroy();
    },
  };
}
