import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Socket } from 'node:net';

export function tempBoardDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artboard-test-'));
  const viewer = fs.mkdtempSync(path.join(os.tmpdir(), 'artboard-viewer-'));
  fs.writeFileSync(path.join(viewer, 'index.html'), '<!doctype html><title>viewer</title>');
  fs.mkdirSync(path.join(viewer, 'assets'));
  fs.writeFileSync(path.join(viewer, 'assets', 'app.js'), 'console.log(1)');
  return { dir, viewer };
}

export function writeBoard(dir: string, canvas: unknown, files: Record<string, string> = {}) {
  for (const [file, html] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), html);
  }
  fs.writeFileSync(path.join(dir, 'canvas.json'), JSON.stringify(canvas));
}

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

export async function waitFor(check: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 20));
  }
}
