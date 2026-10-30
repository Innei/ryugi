import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, test, vi } from 'vitest';

import { call, closeAll, sha256, start } from './fake-cloud';
import { writeArtboard } from './helpers';

afterEach(closeAll);

const canvas = {
  version: 1,
  pages: [{ id: 'verify', name: 'Verify' }],
  boards: {
    save: { type: 'video', src: 'pages/save.webm', page: 'verify', x: 0, y: 0, w: 160, h: 96 },
  },
  groups: { flow: { boards: ['save'], verify: true } },
};

function capture(file: string, color = 'red') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sources = [
    `color=c=${color}:s=160x96:r=10:d=5`,
    'testsrc2=s=160x96:r=10:d=2',
    'color=c=blue:s=160x96:r=10:d=5',
    'testsrc2=s=160x96:r=10:d=2',
    'color=c=green:s=160x96:r=10:d=6',
  ];
  const encoded = spawnSync('ffmpeg', [
    '-v',
    'error',
    ...sources.flatMap((source) => ['-f', 'lavfi', '-i', source]),
    '-filter_complex',
    '[0:v][1:v][2:v][3:v][4:v]concat=n=5:v=1:a=0[v]',
    '-map',
    '[v]',
    '-c:v',
    'libvpx-vp9',
    '-lossless',
    '1',
    file,
  ]);
  expect(encoded.status, encoded.stderr?.toString()).toBe(0);
}

test('Verify videos prepare automatically before acceptance and publish the same bytes as local playback', async () => {
  const { server, root, cloud } = await start();
  const dir = writeArtboard(root, 'save', canvas);
  const source = path.join(dir, 'pages/save.webm');
  capture(source);
  const original = fs.readFileSync(source);
  const spec = fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8');

  const first = await call(server, 'GET', '/api/artifacts/artboard/save');
  expect(first.json.pending).toEqual(['save']);
  expect((await call(server, 'POST', '/api/cloud/publish/artboard/save')).status).toBe(409);
  const vote = () =>
    fetch(`http://127.0.0.1:${server.port}/api/artboard/save/comments?key=${server.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': `http://127.0.0.1:${server.port}` },
      body: JSON.stringify({
        op: 'create',
        anchor: { page: 'verify', group: 'flow', verdict: 'pass', x: 0, y: 0 },
        text: '通过',
      }),
    });
  expect((await vote()).status).toBe(409);

  let ready: any;
  await vi.waitFor(
    async () => {
      ready = (await call(server, 'GET', '/api/artifacts/artboard/save')).json;
      expect(ready.pending).toEqual([]);
      expect(ready.recordings.save.status).toBe('ready');
    },
    { timeout: 10_000 },
  );
  const board = ready.canvas.boards.save;
  expect(board.src).not.toBe('pages/save.webm');
  const response = await fetch(`http://127.0.0.1:${server.port}${ready.contentBase}${board.src}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('video/mp4');
  const prepared = Buffer.from(await response.arrayBuffer());
  // A 10fps timeline can differ by one frame across FFmpeg versions.
  expect(Math.abs(ready.recordings.save.removed - 9)).toBeLessThan(0.15);
  expect((await call(server, 'POST', '/api/agent/artboard/save/check')).json.recordings).toEqual(
    ready.recordings,
  );
  expect((await vote()).status).toBe(200);

  expect((await call(server, 'POST', '/api/cloud/publish/artboard/save')).status).toBe(200);
  const published = [...cloud.store.values()][0]!.versions.at(-1)!;
  expect(published.payload.canvas.boards.save.src).toBe(board.src);
  expect(published.files.find((file) => file.path === board.src)?.hash).toBe(sha256(prepared));
  expect(published.files.some((file) => file.path === 'pages/save.webm')).toBe(false);
  expect(fs.readFileSync(source)).toEqual(original);
  expect(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8')).toBe(spec);
  const comments = () =>
    call(server, 'POST', '/api/agent/artboard/save/comments', { op: 'list', all: true });
  expect((await comments()).json.groups).toMatchObject([{ verdict: 'pass' }]);
  const replacement = path.join(root, '.state/next.webm');
  capture(replacement, 'yellow');
  fs.copyFileSync(replacement, source);
  expect((await call(server, 'GET', '/api/artifacts/artboard/save')).json.pending).toEqual([
    'save',
  ]);
  expect((await vote()).status).toBe(409);
  await vi.waitFor(async () =>
    expect((await comments()).json.groups).toMatchObject([
      { verdict: 'pending', evidenceUpdated: true },
    ]),
  );
}, 15_000);

test('missing FFmpeg falls back to the original for local playback, check and cloud publication', async () => {
  const { server, root, cloud } = await start();
  const dir = writeArtboard(root, 'fallback', canvas);
  capture(path.join(dir, 'pages/save.webm'));
  vi.stubEnv('PATH', root);
  try {
    let check: any;
    await vi.waitFor(
      async () => {
        check = (await call(server, 'POST', '/api/agent/artboard/fallback/check')).json;
        expect(check.recordings.save.status).toBe('original');
      },
      { timeout: 5000 },
    );
    expect(check.pending).toEqual([]);
    expect(check.recordings.save.warning).toContain('ffprobe is unavailable');
    const meta: any = (await call(server, 'GET', '/api/artifacts/artboard/fallback')).json;
    expect(meta.canvas.boards.save.src).toBe('pages/save.webm');
    const response = await fetch(
      `http://127.0.0.1:${server.port}${meta.contentBase}pages/save.webm`,
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      fs.readFileSync(path.join(dir, 'pages/save.webm')),
    );
    expect((await call(server, 'POST', '/api/cloud/publish/artboard/fallback')).status).toBe(200);
    expect([...cloud.store.values()][0]!.versions.at(-1)!.files).toContainEqual({
      path: 'pages/save.webm',
      hash: sha256(fs.readFileSync(path.join(dir, 'pages/save.webm'))),
    });
  } finally {
    vi.unstubAllEnvs();
  }
}, 10_000);

test('preparing a shared video does not invalidate a verdict on its untrimmed board', async () => {
  const { server, root } = await start();
  const spec = {
    ...canvas,
    boards: { ...canvas.boards, raw: { ...canvas.boards.save, trim: false, x: 400 } },
    groups: { ...canvas.groups, raw: { boards: ['raw'], verify: true } },
  };
  const dir = writeArtboard(root, 'shared', spec);
  capture(path.join(dir, 'pages/save.webm'));
  expect((await call(server, 'GET', '/api/artifacts/artboard/shared')).json.pending).toEqual([
    'save',
  ]);
  const voted = await fetch(
    `http://127.0.0.1:${server.port}/api/artboard/shared/comments?key=${server.token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': `http://127.0.0.1:${server.port}` },
      body: JSON.stringify({
        op: 'create',
        anchor: { page: 'verify', group: 'raw', verdict: 'pass', x: 0, y: 0 },
        text: '原片通过',
      }),
    },
  );
  expect(voted.status).toBe(200);
  await vi.waitFor(
    async () =>
      expect((await call(server, 'GET', '/api/artifacts/artboard/shared')).json.pending).toEqual(
        [],
      ),
    { timeout: 10_000 },
  );
  const groups: any = (
    await call(server, 'POST', '/api/agent/artboard/shared/comments', { op: 'list', all: true })
  ).json.groups;
  expect(groups.find((group: any) => group.id === 'raw').verdict).toBe('pass');
}, 15_000);
