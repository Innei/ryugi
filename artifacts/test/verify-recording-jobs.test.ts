import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test, vi } from 'vitest';

import { checkText } from '../src/cli/check';
import { readCanvas } from '../src/server/state';
import { createVerifyRecordings } from '../src/server/verify-recordings';
import { writeArtboard } from './helpers';

const roots: string[] = [];
const managers: ReturnType<typeof createVerifyRecordings>[] = [];
afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.close()));
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
const canvas = {
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: { clip: { type: 'video', src: 'pages/clip.webm', page: 'p', x: 0, y: 0, w: 160, h: 96 } },
  groups: { g: { boards: ['clip'], verify: true } },
};
const result = { status: 'trimmed' as const, duration: 10, start: 3, end: 7, removed: 6 };
function fixture(prepare: NonNullable<Parameters<typeof createVerifyRecordings>[0]['prepare']>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'recording-jobs-'));
  roots.push(root);
  const dir = writeArtboard(root, 'one', canvas, { 'pages/clip.webm': 'first capture' });
  const stateDir = path.join(root, '.state');
  const manager = createVerifyRecordings({ stateDir, stableMs: 10, onChange: () => {}, prepare });
  managers.push(manager);
  const read = () => manager.project('one', dir, readCanvas(dir));
  return { root, dir, stateDir, manager, read };
}

test('an edit during encoding discards the obsolete result and processes an immutable new capture', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const inputs: string[] = [];
  const f = fixture(async (input, output) => {
    const captured = fs.readFileSync(input, 'utf8');
    inputs.push(captured);
    if (captured === 'first capture') await gate;
    fs.writeFileSync(output, `prepared: ${fs.readFileSync(input, 'utf8')}`);
    return result;
  });
  expect(f.read().pending).toEqual(['clip']);
  try {
    await vi.waitFor(() => expect(inputs).toEqual(['first capture']));
    fs.writeFileSync(path.join(f.dir, 'pages/clip.webm'), 'second capture');
    expect(f.read().pending).toEqual(['clip']);
  } finally {
    release();
  }
  let ready = f.read();
  await vi.waitFor(() => {
    ready = f.read();
    expect(ready.pending).toEqual([]);
  });
  expect(inputs).toEqual(['first capture', 'second capture']);
  const output = f.manager.resolve('one', ready.canvas!.boards.clip!.file)!;
  expect(fs.readFileSync(output, 'utf8')).toBe('prepared: second capture');
  expect(fs.readFileSync(path.join(f.dir, 'pages/clip.webm'), 'utf8')).toBe('second capture');
});

test('a durable content cache survives a restart and avoids re-encoding the same source', async () => {
  const f = fixture(async (_input, output) => {
    fs.writeFileSync(output, 'prepared bytes');
    return result;
  });
  await vi.waitFor(() => expect(f.read().pending).toEqual([]));
  const first = f.read().canvas!.boards.clip!.file;
  await f.manager.close();
  const resumed = createVerifyRecordings({
    stateDir: f.stateDir,
    stableMs: 10,
    onChange: () => {},
    prepare: async () => {
      throw new Error('cache miss');
    },
  });
  managers.push(resumed);
  let ready = resumed.project('one', f.dir, readCanvas(f.dir));
  await vi.waitFor(() => {
    ready = resumed.project('one', f.dir, readCanvas(f.dir));
    expect(ready.recordings!.clip!.status).toBe('ready');
  });
  expect(ready.canvas!.boards.clip!.file).toBe(first);
  expect(fs.readFileSync(resumed.resolve('one', first)!, 'utf8')).toBe('prepared bytes');
});

test('failed preparation falls back once and exposes a non-blocking check warning', async () => {
  const f = fixture(async () => {
    throw new Error('ffmpeg unavailable');
  });
  let ready = f.read();
  await vi.waitFor(() => {
    ready = f.read();
    expect(ready.pending).toEqual([]);
  });
  expect(ready.canvas!.boards.clip!.src).toBe('pages/clip.webm');
  expect(ready.recordings!.clip).toMatchObject({
    status: 'original',
    warning: expect.stringContaining('ffmpeg unavailable'),
  });
  expect(ready.warnings).toEqual([]);
  expect(checkText({ type: 'checked', artifact: 'artboard/one', ...ready })).toContain(
    'warning: recording clip:',
  );
  expect(f.read().recordings).toEqual(ready.recordings);
});

test.each(['ordinary', 'preserve'])('%s video bypasses automatic trimming', async (mode) => {
  const f = fixture(async () => {
    throw new Error('must not process this video');
  });
  const spec =
    mode === 'ordinary'
      ? { ...canvas, groups: { g: { boards: ['clip'], verify: false } } }
      : { ...canvas, boards: { clip: { ...canvas.boards.clip, trim: false } } };
  fs.writeFileSync(path.join(f.dir, 'canvas.json'), JSON.stringify(spec));
  const payload = f.read();
  expect(payload.pending).toEqual([]);
  expect(payload.recordings).toBeUndefined();
  expect(payload.canvas!.boards.clip!.src).toBe('pages/clip.webm');
  expect(fs.existsSync(path.join(f.stateDir, 'recordings'))).toBe(false);
});
