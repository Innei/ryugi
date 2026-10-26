import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';
import { renderBoardPlaceholder, renderThumbnail, THUMBNAIL_PATH, type ThumbnailArtifact } from '../src/shared/thumbnail';

const fixtures = path.join(__dirname, 'fixtures/thumbnails');
const names = fs.readdirSync(fixtures).filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -'.json'.length));

test('the thumbnail path keeps the version Ryugi Cloud already caches', () => {
  expect(THUMBNAIL_PATH).toBe('_ryugi/thumbnail-v1.svg');
});

test.each(names)('%s renders byte for byte what Ryugi Cloud rendered before the move', (name) => {
  const { artifact, payload } = JSON.parse(fs.readFileSync(path.join(fixtures, `${name}.json`), 'utf8')) as { artifact: ThumbnailArtifact; payload: unknown };
  expect(renderThumbnail(artifact, payload)).toBe(fs.readFileSync(path.join(fixtures, `${name}.svg`), 'utf8'));
});

test('artboard group titles and notes come from saved layout data and cannot inject markup', () => {
  const svg = renderThumbnail({ id: 'a', title: 'Notes', type: 'artboard', project: null }, {
    canvas: { pages: [{ id: 'p' }], boards: {}, groups: { q1: { title: 'Real group', boards: [] } },
      notes: { intro: { page: 'p', kind: 'title', text: '真实标题' }, why: { page: 'p', kind: 'sticky', text: '<script>bad()</script>', color: 'url(https://bad.example)' } } },
    layout: { pages: { p: { bounds: { minX: 0, minY: 0, maxX: 600, maxY: 360 }, groups: { q1: { x: 0, y: 100, w: 500, h: 200 } },
      notes: { intro: { x: 0, y: 0, w: 500, h: 80 }, why: { x: 510, y: 100, w: 80, h: 80 } } } } },
  });
  expect(svg).toContain('Real group');
  expect(svg).toContain('真实标题');
  expect(svg).toContain('&lt;script&gt;');
  expect(svg).not.toContain('<script>');
  expect(svg).not.toContain('https://bad.example');
});

test('malformed and extreme layout data still produces finite, bounded SVG', () => {
  const artifact: ThumbnailArtifact = { id: 'a', title: '<bad>', type: 'artboard', project: null };
  for (const payload of [null, {}, { canvas: { pages: [{ id: 'p' }], boards: { tiny: { page: 'p', x: 0, y: 0, w: 1e-320, h: 1e-320 } } } }]) {
    const svg = renderThumbnail(artifact, payload);
    expect(svg).toContain('<svg');
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    expect(svg.length).toBeLessThan(10_000);
  }
});

test('a board placeholder is a paper card the board size, with its title and id', () => {
  const svg = renderBoardPlaceholder({ id: 'q1-a', title: 'Sidebar <nav> & tabs', w: 1280, h: 800 });
  expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1280 800"/);
  expect(svg).toContain('Sidebar &lt;nav&gt; &amp; tabs');
  expect(svg).toContain('q1-a');
  expect(svg).toContain('prefers-color-scheme: dark');
  expect(svg).toContain('var(--paper)');
  expect(svg).not.toMatch(/<script|<foreignObject|<image|\son\w+=/i);
});

test('a board placeholder without a title shows its id, and odd sizes stay finite', () => {
  expect(renderBoardPlaceholder({ id: 'hero-2', w: 390, h: 844 })).toContain('hero-2');
  for (const [w, h] of [[0, 0], [Number.NaN, 10], [1e-320, 1e9]] as [number, number][]) {
    const svg = renderBoardPlaceholder({ id: 'x', title: 'X', w, h });
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  }
});
