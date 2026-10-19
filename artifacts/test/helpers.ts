import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Socket } from 'node:net';

export function tempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-test-'));
  const viewer = fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-viewer-'));
  fs.writeFileSync(path.join(viewer, 'index.html'), '<!doctype html><title>viewer</title>');
  fs.mkdirSync(path.join(viewer, 'assets'));
  fs.writeFileSync(path.join(viewer, 'assets', 'app.js'), 'console.log(1)');
  return { root, viewer };
}

export function writeFiles(dir: string, files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
}

export function writeArtboard(root: string, id: string, canvas: unknown, files: Record<string, string> = {}) {
  const dir = path.join(root, 'artboard', id);
  writeFiles(dir, files);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'canvas.json'), JSON.stringify(canvas));
  return dir;
}

export function writeHtml(root: string, id: string, files: Record<string, string>) {
  const dir = path.join(root, 'html', id);
  fs.mkdirSync(dir, { recursive: true });
  writeFiles(dir, files);
  return dir;
}

export const readJson = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

export interface Fetched {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

export function get(url: string, headers: Record<string, string> = {}): Promise<Fetched> {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers }, (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      })
      .on('error', reject);
  });
}

export interface WsResult {
  status: number;
  socket?: Socket;
  messages: string[];
}

export function openWs(port: number, headers: Record<string, string>): Promise<WsResult> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/ws',
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': Buffer.from('artboard-test-key').toString('base64'),
        ...headers,
      },
    });
    req.on('upgrade', (res, socket) => {
      const result: WsResult = { status: res.statusCode ?? 0, socket, messages: [] };
      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 2) {
          let len = buffer[1]! & 0x7f;
          let offset = 2;
          if (len === 126) {
            len = buffer.readUInt16BE(2);
            offset = 4;
          }
          if (buffer.length < offset + len) break;
          result.messages.push(buffer.subarray(offset, offset + len).toString('utf8'));
          buffer = buffer.subarray(offset + len);
        }
      });
      resolve(result);
    });
    req.on('response', (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, messages: [] });
    });
    req.on('error', reject);
    req.end();
  });
}

export function sendWsText(socket: Socket, text: string) {
  const payload = Buffer.from(text);
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]!));
  let header: Buffer;
  if (payload.length < 126) header = Buffer.from([0x81, 0x80 | payload.length]);
  else {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  }
  socket.write(Buffer.concat([header, mask, masked]));
}

export async function waitFor(check: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 20));
  }
}
