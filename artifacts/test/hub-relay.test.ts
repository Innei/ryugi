import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';
import type WebSocket from 'ws';
import { WebSocketServer } from 'ws';

import { updateArtifactConfig } from '../src/server/config';
import { writeCredentials } from '../src/server/credentials';
import { startHub } from '../src/server/hub';
import { machinePaths } from '../src/server/machine';
import { tempRoot, writeDocument } from './helpers';

interface Cloud {
  messages: any[];
  next: (t: string) => Promise<any>;
  send: (message: unknown) => void;
  sockets: WebSocket[];
  url: string;
}

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fakeCloud(): Promise<Cloud> {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => server.once('listening', resolve));
  const cloud: Cloud = {
    url: `ws://127.0.0.1:${(server.address() as { port: number }).port}/api/relay/host`,
    sockets: [],
    messages: [],
    next: (t) =>
      new Promise((resolve, reject) => {
        const until = Date.now() + 5000;
        const tick = () => {
          const i = cloud.messages.findIndex((m) => m.t === t);
          if (i >= 0) return resolve(cloud.messages.splice(i, 1)[0]);
          if (Date.now() > until) return reject(new Error(`no ${t}`));
          setTimeout(tick, 10);
        };
        tick();
      }),
    send: (message) => cloud.sockets.at(-1)!.send(JSON.stringify(message)),
  };
  server.on('connection', (socket) => {
    cloud.sockets.push(socket);
    socket.on('message', (data) => {
      const text = data.toString();
      if (text === 'ping') return socket.send('pong');
      cloud.messages.push(JSON.parse(text));
    });
  });
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        for (const socket of cloud.sockets) socket.terminate();
        server.close(() => resolve());
      }),
  );
  return cloud;
}

function publishedProject(slug: string, cloudId: string, text: string) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-hub-relay-')));
  writeDocument(path.join(dir, '.ryugi', 'artifacts'), slug, {
    'doc.xml': `<doc><h1>${text}</h1></doc>`,
  });
  updateArtifactConfig(path.join(dir, '.ryugi', 'config.json'), `document/${slug}`, {
    cloud: { id: cloudId, url: 'u', publishedAt: '2026-11-01T00:00:00Z', visibility: 'private' },
  });
  return dir;
}

async function hubWith(cloud: Cloud) {
  const temp = tempRoot();
  const credentialsFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-home-')),
    'credentials.json',
  );
  writeCredentials(credentialsFile, { origin: 'https://cloud.example', token: 'tok', login: 'me' });
  const hub = await startHub({
    host: '127.0.0.1',
    urlHost: 'localhost',
    viewerDir: temp.viewer,
    runtimeDir: temp.runtime,
    ports: [0],
    boardPorts: [0],
    paths: machinePaths({
      RYUGI_SERVER_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-hub-home-')),
    }),
    token: 't'.repeat(48),
    version: '9.9.9',
    cloud: { origin: 'https://cloud.example', credentialsFile },
    relay: { url: cloud.url, version: '9.9.9', pollMs: 50 },
  });
  cleanups.push(() => hub.close());
  return hub;
}

test('the hub opens one relay connection that announces every project', async () => {
  const cloud = await fakeCloud();
  const hub = await hubWith(cloud);
  await hub.register(publishedProject('alpha', 'cloudalpha', 'Alpha'));
  await hub.register(publishedProject('beta', 'cloudbeta', 'Beta'));
  const until = Date.now() + 5000;
  let ids: string[] = [];
  while (Date.now() < until && ids.length < 2) {
    const message = cloud.messages.find((m) => m.t === 'hello' || m.t === 'ids');
    if (message) {
      cloud.messages.splice(cloud.messages.indexOf(message), 1);
      ids = message.ids;
    } else await new Promise((resolve) => setTimeout(resolve, 20));
  }
  expect(ids).toEqual(['cloudalpha', 'cloudbeta']);
  expect(cloud.sockets).toHaveLength(1);
});

test('the hub announces its own port and routes a relay request to the owning project', async () => {
  const cloud = await fakeCloud();
  const hub = await hubWith(cloud);
  await hub.register(publishedProject('alpha', 'cloudalpha', 'Alpha'));
  await hub.register(publishedProject('beta', 'cloudbeta', 'Beta'));
  const hello = await cloud.next('hello');
  expect(hello.local.port).toBe(hub.port);
  cloud.send({ t: 'request', conn: 'v1', id: 'cloudbeta', rid: 1, body: { op: 'meta' } });
  const reply = await cloud.next('reply');
  expect(reply.rid).toBe(1);
  expect(reply.body.ok).toBe(true);
  expect(JSON.stringify(reply.body.data)).toContain('Beta');
});
