import crypto from 'node:crypto';
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

export const mimeOf = (file: string) =>
  MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

export const randomToken = () => crypto.randomBytes(24).toString('base64url');

export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

export function readPersisted(file: string) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

export function listen(server: http.Server, host: string, port: number) {
  return new Promise<number>((resolve, reject) => {
    const onError = (err: Error) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as { port: number }).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export const urlHostForHttp = (host: string) =>
  host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

export function send(
  res: http.ServerResponse,
  status: number,
  body: string | Buffer,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, {
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function sendJson(res: http.ServerResponse, status: number, value: unknown) {
  send(res, status, JSON.stringify(value), { 'Content-Type': MIME['.json']! });
}

function byteRange(
  range: string | undefined,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start > end || start >= size ? 'unsatisfiable' : { start, end };
}

export function sendFile(
  res: http.ServerResponse,
  file: string,
  headers: Record<string, string> = {},
  range?: string,
) {
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      send(res, 404, 'Not found');
      return;
    }
    const base = {
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      'Content-Type': mimeOf(file),
      'Accept-Ranges': 'bytes',
      ...headers,
    };
    const part = byteRange(range, stat.size);
    if (part === 'unsatisfiable') {
      res.writeHead(416, { ...base, 'Content-Range': `bytes */${stat.size}` });
      res.end();
      return;
    }
    if (part)
      res.writeHead(206, {
        ...base,
        'Content-Range': `bytes ${part.start}-${part.end}/${stat.size}`,
        'Content-Length': String(part.end - part.start + 1),
      });
    else res.writeHead(200, { ...base, 'Content-Length': String(stat.size) });
    fs.createReadStream(file, part ?? {})
      .on('error', () => res.destroy())
      .pipe(res);
  });
}
