import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { readCanvas } from '../src/server/state';
import { writeArtboard } from './helpers';

const roots: string[] = [];
const spec = {
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: { a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
};

function artboard(canvas: object = spec, files: Record<string, string> = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-state-'));
  roots.push(root);
  const dir = writeArtboard(root, 'ideas', canvas, files);
  fs.mkdirSync(path.join(dir, 'pages/p'), { recursive: true });
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test('a declaration opens a building skeleton without agent-maintained state', () => {
  const payload = readCanvas(artboard());
  expect(payload.warnings).toEqual([]);
  expect(payload.pending).toEqual(['a']);
  expect(payload.canvas?.building).toBe(true);
  expect(payload.canvas?.writing).toBeUndefined();
});

test.each(['', '   ', '<!doctype', '<html', '<!doctype html>', '<html><body>Half', '<!DOCTYPE HTML><HTML><BODY>Half'])(
  'withholds an unfinished board and identifies its writer: %j', (html) => {
    const payload = readCanvas(artboard(spec, { 'pages/p/a.html': html }));
    expect(payload.warnings).toEqual([]);
    expect(payload.pending).toEqual(['a']);
    expect(payload.versions['pages/p/a.html']).toBe(0);
    expect(payload.canvas?.writing).toBe('a');
  },
);

test('finishing the HTML clears derived state without rewriting canvas.json', () => {
  const dir = artboard({ ...spec, building: true, writing: 'a' }, {
    'pages/p/a.html': '<!doctype html><html><body>Drawing',
  });
  const source = fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8');
  expect(readCanvas(dir).pending).toEqual(['a']);

  fs.appendFileSync(path.join(dir, 'pages/p/a.html'), '</body></HTML>\n<!-- generated -->\n');
  const payload = readCanvas(dir);
  expect(payload.warnings).toEqual([]);
  expect(payload.pending).toEqual([]);
  expect(payload.versions['pages/p/a.html']).toBeGreaterThan(0);
  expect(payload.canvas?.building).toBe(false);
  expect(payload.canvas?.writing).toBeUndefined();
  expect(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8')).toBe(source);
});

test('a revision infers the latest incomplete writer and clears it when complete', () => {
  const dir = artboard({
    ...spec,
    building: false,
    boards: { ...spec.boards, b: { ...spec.boards.a, file: 'pages/p/b.html', x: 720 } },
  }, {
    'pages/p/a.html': '<html><body>First',
    'pages/p/b.html': '<html><body>Second',
  });
  fs.utimesSync(path.join(dir, 'pages/p/a.html'), new Date(1000), new Date(1000));
  expect(readCanvas(dir).canvas?.writing).toBe('b');
  fs.appendFileSync(path.join(dir, 'pages/p/b.html'), '</body></html>');
  expect(readCanvas(dir).canvas?.writing).toBe('a');
  fs.appendFileSync(path.join(dir, 'pages/p/a.html'), '</body></html>');
  expect(readCanvas(dir).canvas?.writing).toBeUndefined();
});

test('a deleted board becomes pending without a stale writer', () => {
  const dir = artboard(spec, { 'pages/p/a.html': '<html><body>Ready</body></html>' });
  expect(readCanvas(dir).pending).toEqual([]);
  fs.unlinkSync(path.join(dir, 'pages/p/a.html'));
  const payload = readCanvas(dir);
  expect(payload.pending).toEqual(['a']);
  expect(payload.canvas?.building).toBe(true);
  expect(payload.canvas?.writing).toBeUndefined();
});

test('keeps existing nonempty HTML fragments available', () => {
  const payload = readCanvas(artboard(spec, { 'pages/p/a.html': '<p>Legacy board</p>' }));
  expect(payload.warnings).toEqual([]);
  expect(payload.pending).toEqual([]);
  expect(payload.versions['pages/p/a.html']).toBeGreaterThan(0);
});

const media = {
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: {
    shot: { type: 'image', src: 'pages/p/shot.png', page: 'p', x: 0, y: 0, w: 640, h: 400 },
    flow: { type: 'video', src: 'pages/p/flow.webm', page: 'p', x: 720, y: 0, w: 640, h: 400 },
  },
};

test('a media board is ready once its file has bytes, and reads as file = src', () => {
  const payload = readCanvas(artboard(media, { 'pages/p/shot.png': '\x89PNG', 'pages/p/flow.webm': '' }));
  expect(payload.warnings).toEqual([]);
  expect(payload.canvas?.boards.shot?.file).toBe('pages/p/shot.png');
  expect(payload.versions['pages/p/shot.png']).toBeGreaterThan(0);
  expect(payload.pending).toEqual(['flow']);
  expect(payload.canvas?.writing).toBeUndefined();
});

