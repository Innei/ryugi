import { describe, expect, test } from 'vitest';
import { validateCanvas } from '../src/shared/validate';
import type { CanvasSpec } from '../src/shared/types';

const exists = () => true;

const base = (): CanvasSpec => ({
  version: 1,
  pages: [{ id: 'p', name: 'P' }],
  boards: {
    a: { file: 'pages/p/a.html', page: 'p', x: 0, y: 0, w: 1280, h: 800 },
    b: { file: 'pages/p/b.html', page: 'p', x: 1360, y: 0, w: 1280, h: 800 },
  },
});

describe('validateCanvas', () => {
  test('rejects malformed colors and writing targets before they reach the viewer', () => {
    const canvas = { ...base(), writing: 42, notes: { n: { page: 'p', kind: 'sticky', x: 3000, y: 0, text: 'Note', color: 'url(https://example.com)' } } };
    const warnings = validateCanvas(canvas, exists);
    expect(warnings).toContain('"writing" must be a board id');
    expect(warnings.some((warning) => warning.includes('color'))).toBe(true);
    expect(validateCanvas({ ...base(), writing: 'missing' }, exists)).toContain('writing target "missing" is not a board');
  });

  test('a well-formed canvas has no warnings', () => {
    expect(validateCanvas(base(), exists)).toEqual([]);
  });

  test('rejects a value that is not an object', () => {
    expect(validateCanvas([], exists)).toEqual(['canvas.json must be a JSON object']);
  });

  test('rejects a non-boolean interactive flag and building state', () => {
    const canvas = base() as unknown as {
      building: unknown;
      boards: Record<string, Record<string, unknown>>;
    };
    canvas.building = 'yes';
    canvas.boards.a!.interactive = 'always';
    const warnings = validateCanvas(canvas, exists);
    expect(warnings).toContain('"building" must be a boolean');
    expect(warnings).toContain('board "a" field "interactive" must be a boolean');
  });

  test('reports missing and non-numeric board fields', () => {
    const canvas = base() as unknown as { boards: Record<string, Record<string, unknown>> };
    delete canvas.boards.a!.page;
    canvas.boards.b!.w = '1280';
    const warnings = validateCanvas(canvas, exists);
    expect(warnings).toContain('board "a" is missing "page"');
    expect(warnings).toContain('board "b" field "w" must be a number');
  });

  test('reports an unknown page and a missing board file', () => {
    const canvas = base();
    canvas.boards.a!.page = 'nope';
    const warnings = validateCanvas(canvas, (file) => file !== 'pages/p/b.html');
    expect(warnings).toContain('board "a" uses unknown page "nope"');
    expect(warnings).toContain('board "b" file not found: pages/p/b.html');
  });

  test('reports overlapping boards on the same page only', () => {
    const canvas = base();
    canvas.boards.b!.x = 1000;
    expect(validateCanvas(canvas, exists)).toContain('boards "a" and "b" overlap');
    canvas.pages.push({ id: 'q', name: 'Q' });
    canvas.boards.b!.page = 'q';
    expect(validateCanvas(canvas, exists)).toEqual([]);
  });

  test('reports groups with missing members or members on several pages', () => {
    const canvas = base();
    canvas.pages.push({ id: 'q', name: 'Q' });
    canvas.boards.b!.page = 'q';
    canvas.groups = { g: { title: 'G', boards: ['a', 'b', 'ghost'] } };
    const warnings = validateCanvas(canvas, exists);
    expect(warnings).toContain('group "g" references unknown board "ghost"');
    expect(warnings).toContain('group "g" spans several pages');
  });

  test('reports overlapping group frames', () => {
    const canvas = base();
    canvas.boards.b!.x = 0;
    canvas.boards.b!.y = 900;
    canvas.groups = { g1: { boards: ['a'] }, g2: { boards: ['b'] } };
    expect(validateCanvas(canvas, exists)).toContain('groups "g1" and "g2" overlap');
  });

  test('reports a title note that overlaps a group frame', () => {
    const canvas = base();
    canvas.groups = { g: { boards: ['a', 'b'] } };
    canvas.notes = { t: { page: 'p', kind: 'title', x: 0, y: -180, text: 'Round 1' } };
    expect(validateCanvas(canvas, exists)).toContain('title "t" overlaps group "g"');
  });

  test('reports a sticky covering a board, using its estimated height', () => {
    const canvas = base();
    canvas.notes = { s: { page: 'p', kind: 'sticky', x: 1340, y: -100, w: 200, text: 'x' } };
    expect(validateCanvas(canvas, exists)).not.toContain('sticky "s" covers board "b"');
    canvas.notes = { s: { page: 'p', kind: 'sticky', x: 1340, y: -100, w: 200, text: 'one\ntwo\nthree' } };
    expect(validateCanvas(canvas, exists)).toContain('sticky "s" covers board "b"');
  });

  test('reports a note on an unknown page', () => {
    const canvas = base();
    canvas.notes = { t: { page: 'nope', kind: 'title', x: 0, y: -400, text: 'T' } };
    expect(validateCanvas(canvas, exists)).toContain('note "t" uses unknown page "nope"');
  });

  test('reports page entries without a string id and name', () => {
    const canvas = base() as unknown as { pages: unknown[] };
    canvas.pages.push(null, { id: 3 });
    const warnings = validateCanvas(canvas, exists);
    expect(warnings).toContain('pages[1] needs string "id" and "name"');
    expect(warnings).toContain('pages[2] needs string "id" and "name"');
  });

  test('reports a group whose boards are not all strings', () => {
    const canvas = base() as unknown as { groups: unknown };
    canvas.groups = { g: { boards: ['a', 7] } };
    expect(validateCanvas(canvas, exists)).toContain('group "g" needs a "boards" array');
  });

  test('reports a board file outside pages/', () => {
    const canvas = base();
    canvas.boards.a!.file = './pages/p/a.html';
    expect(validateCanvas(canvas, exists)).toContain('board "a" file must start with "pages/": ./pages/p/a.html');
  });

  test('reports an unknown activePage and an unknown focus target', () => {
    const canvas = base();
    canvas.activePage = 'nope';
    canvas.focus = { target: 'ghost', at: '2026-10-19T00:00:00Z' };
    const warnings = validateCanvas(canvas, exists);
    expect(warnings).toContain('activePage "nope" is not a page');
    expect(warnings).toContain('focus target "ghost" is not a board, group or note');
  });

  test('a media board takes type and src instead of file', () => {
    const canvas = { ...base(), boards: { ...base().boards, v: { type: 'video', src: 'pages/p/flow.webm', page: 'p', x: 2720, y: 0, w: 640, h: 400 } } };
    expect(validateCanvas(canvas, exists)).toEqual([]);
  });

  test('a media board needs a src under pages/ and a known type', () => {
    const board = { page: 'p', x: 2720, y: 0, w: 640, h: 400 };
    expect(validateCanvas({ ...base(), boards: { v: { ...board, type: 'image' } } }, exists)).toContain('board "v" is missing "src"');
    expect(validateCanvas({ ...base(), boards: { v: { ...board, type: 'image', src: 'evidence/a.png' } } }, exists)).toContain('board "v" src must start with "pages/": evidence/a.png');
    expect(validateCanvas({ ...base(), boards: { v: { ...board, type: 'gif', file: 'pages/p/a.gif' } } }, exists)).toContain('board "v" field "type" must be "html", "image" or "video"');
  });

  test('a group verify flag must be a boolean', () => {
    const canvas = { ...base(), groups: { g: { boards: ['a', 'b'], verify: 'yes' } } };
    expect(validateCanvas(canvas, exists)).toContain('group "g" field "verify" must be a boolean');
    expect(validateCanvas({ ...base(), groups: { g: { boards: ['a', 'b'], verify: true } } }, exists)).toEqual([]);
  });
});
