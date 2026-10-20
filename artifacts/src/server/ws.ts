import crypto from 'node:crypto';
import type { Duplex } from 'node:stream';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPCODE_TEXT = 0x01;
const OPCODE_CLOSE = 0x08;
const OPCODE_PING = 0x09;
const OPCODE_PONG = 0x0a;
const MAX_CLIENT_FRAME = 8 * 1024 * 1024;

export function acceptKey(clientKey: string) {
  return crypto.createHash('sha1').update(clientKey + WS_MAGIC).digest('base64');
}

export function encodeFrame(opcode: number, payload: Buffer) {
  const len = payload.length;
  let header: Buffer;
  if (len < 126) {
    header = Buffer.from([0x80 | opcode, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

export const textFrame = (text: string) => encodeFrame(OPCODE_TEXT, Buffer.from(text));

export function completeHandshake(socket: Duplex, clientKey: string) {
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey(clientKey)}\r\n\r\n`,
  );
}

export function rejectUpgrade(socket: Duplex, status: number, reason: string) {
  socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

export function handleClientFrames(socket: Duplex, onText?: (text: string) => void) {
  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const fin = (buffer[0]! & 0x80) !== 0;
      const opcode = buffer[0]! & 0x0f;
      let len = buffer[1]! & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buffer.length < 4) return;
        len = buffer.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buffer.length < 10) return;
        const big = buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_CLIENT_FRAME)) {
          socket.destroy();
          return;
        }
        len = Number(big);
        offset = 10;
      }
      const total = offset + 4 + len;
      if (buffer.length < total) return;
      const mask = buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(buffer.subarray(offset + 4, total));
      for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i % 4]!;
      buffer = buffer.subarray(total);
      if (opcode === OPCODE_CLOSE) {
        socket.end(encodeFrame(OPCODE_CLOSE, Buffer.alloc(0)));
        return;
      }
      if (opcode === OPCODE_PING) socket.write(encodeFrame(OPCODE_PONG, payload));
      else if (opcode === OPCODE_TEXT && fin) onText?.(payload.toString('utf8'));
    }
  });
}
