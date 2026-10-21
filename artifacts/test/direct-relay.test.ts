import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import WebSocket from 'ws';
import { startArtifactsServer, type ArtifactsServer } from '../src/server/app';
import { updateArtifactConfig } from '../src/server/config';
import { tempRoot, writeHtml } from './helpers';

const CLOUD = 'https://cloud.example';
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function start() {
  const temp = tempRoot();
  const configFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-dir-')), 'config.json');
  const credentialsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-home-')), 'credentials.json');
  writeHtml(temp.root, 'page', { 'index.html': '<p>hi</p>' });
  updateArtifactConfig(configFile, 'html/page', { cloud: { id: 'cloudpage', url: 'u', publishedAt: null, visibility: 'private' } });
  const server = await startArtifactsServer({
    root: temp.root,
    viewerDir: temp.viewer,
    runtimeDir: temp.runtime,
    host: '127.0.0.1',
    urlHost: 'localhost',
    debounceMs: 20,
    configFile,
    cloud: { origin: CLOUD, credentialsFile },
    relay: { url: 'ws://127.0.0.1:9/api/relay/host', version: '1.14.0', pollMs: 60_000 },
  });
  cleanups.push(() => server.close());
  return { server, root: temp.root };
}

interface Pipe {
  messages: any[];
  next(t: string): Promise<any>;
  request(body: unknown): Promise<any>;
}

function connect(server: ArtifactsServer, { id = 'cloudpage', key = server.token, origin = CLOUD } = {}): Promise<Pipe | number> {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}/relay/a/${id}?key=${key}`, { headers: { Origin: origin } });
  ws.on('error', () => {});
  cleanups.push(() => ws.terminate());
  const messages: any[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  const next = async (t: string) => {
    const until = Date.now() + 5000;
    for (;;) {
      const i = messages.findIndex((m) => m.t === t);
      if (i >= 0) return messages.splice(i, 1)[0];
      if (Date.now() > until) throw new Error(`no ${t}`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };
  let rid = 0;
  return new Promise((resolve) => {
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('open', () =>
      resolve({
        messages,
        next,
        request: async (body) => {
          const mine = ++rid;
          ws.send(JSON.stringify({ t: 'request', rid: mine, body }));
          for (;;) {
            const reply = await next('reply');
            if (reply.rid === mine) return reply.body;
          }
        },
      }),
    );
  });
}

describe('direct pipe from the cloud page', () => {
  test('the cloud page connects with the key and is told the server is online', async () => {
    const { server } = await start();
    const pipe = (await connect(server)) as Pipe;
    expect(await pipe.next('presence')).toEqual({ t: 'presence', online: true, version: '1.14.0' });
  });

  test('meta points at this server for content, by the address the page used', async () => {
    const { server } = await start();
    const pipe = (await connect(server)) as Pipe;
    const meta = await pipe.request({ op: 'meta' });
    expect(meta.ok).toBe(true);
    expect(meta.data.contentBase).toBe(`http://127.0.0.1:${server.port}/c/${server.contentToken}/html/page/`);
  });

  test('a file change reaches the page as an event', async () => {
    const { server, root } = await start();
    const pipe = (await connect(server)) as Pipe;
    await pipe.next('presence');
    fs.writeFileSync(path.join(root, 'html/page/index.html'), '<p>changed</p>');
    expect((await pipe.next('event')).body).toMatchObject({ type: 'change', artifact: 'html/page' });
  });

  test('a wrong key, a foreign origin or an artifact this server does not serve is refused', async () => {
    const { server } = await start();
    expect(await connect(server, { key: 'nope' })).toBe(403);
    expect(await connect(server, { origin: 'https://evil.example' })).toBe(403);
    expect(await connect(server, { id: 'someone-else' })).toBe(404);
  });
});
