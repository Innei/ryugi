import { expect, test } from 'vitest';

import type { InspectorNode } from '../src/shared/inspector';
import { SELECTION_MAX_NODES } from '../src/shared/selection';
import { buildSelectionState, fitSelectionMessage } from '../src/viewer/lib/selection';

const node = (
  id: number,
  parentId: number | null,
  tag: string,
  path: string,
  name = '',
): InspectorNode => ({ id, parentId, children: [], tag, name, kind: 'Frame', selector: tag, path });
const boards = {
  'hero-2': { file: 'pages/main/hero-2.html' },
  'side': { file: 'pages/main/side.html' },
};
const frames = {
  'hero-2': {
    session: 's1',
    truncated: false,
    nodes: [
      node(1, null, 'body', 'body'),
      node(12, 1, 'div', 'body > div:nth-of-type(2)', 'Team'),
      node(13, 1, 'p', 'body > p', 'Intro'),
    ],
    tweaks: [
      { id: 12, name: 'Team', property: 'padding' as const, from: '14px', value: '20px' },
      { id: 13, name: 'Intro', property: 'color' as const, from: 'rgb(0, 0, 0)', value: 'red' },
    ],
  },
  'side': {
    session: 's2',
    truncated: false,
    nodes: [node(1, null, 'body', 'body'), node(4, 1, 'h1', 'body > h1', 'Menu')],
    tweaks: [],
  },
};

test('selected nodes carry their ID, file, path, details and own tweaks; other tweaks are listed apart', () => {
  const state = buildSelectionState({
    boards,
    frames,
    targets: [
      { boardId: 'hero-2', id: 12 },
      { boardId: 'side', id: 4 },
    ],
    details: { 'hero-2:12': { id: 12, text: 'Team $12', html: '<div class="card">Team</div>' } },
  });
  expect(state.selected).toEqual([
    {
      id: 'hero-2#12',
      board: 'hero-2',
      file: 'pages/main/hero-2.html',
      tag: 'div',
      path: 'body > div:nth-of-type(2)',
      name: 'Team',
      text: 'Team $12',
      html: '<div class="card">Team</div>',
      tweaks: [{ property: 'padding', from: '14px', value: '20px' }],
    },
    {
      id: 'side#4',
      board: 'side',
      file: 'pages/main/side.html',
      tag: 'h1',
      path: 'body > h1',
      name: 'Menu',
      text: '',
      html: '',
      tweaks: [],
    },
  ]);
  expect(state.more).toBe(0);
  expect(state.tweaks).toEqual([
    {
      id: 'hero-2#13',
      board: 'hero-2',
      file: 'pages/main/hero-2.html',
      tag: 'p',
      path: 'body > p',
      name: 'Intro',
      property: 'color',
      from: 'rgb(0, 0, 0)',
      value: 'red',
    },
  ]);
  expect(state.nodes.map((entry) => entry.id)).toEqual([
    'hero-2#1',
    'hero-2#12',
    'hero-2#13',
    'side#1',
    'side#4',
  ]);
});

test('only the first 20 selected nodes are described in full and unknown boards are skipped', () => {
  const many = Array.from({ length: 25 }, (_, index) =>
    node(index + 2, 1, 'span', `body > span:nth-of-type(${index + 1})`),
  );
  const state = buildSelectionState({
    boards: { a: { file: 'a.html' } },
    frames: {
      a: { nodes: [node(1, null, 'body', 'body'), ...many], tweaks: [] },
      gone: frames.side,
    },
    targets: [...many.map(({ id }) => ({ boardId: 'a', id })), { boardId: 'gone', id: 4 }],
    details: {},
  });
  expect(state.selected).toHaveLength(20);
  expect(state.more).toBe(5);
  expect(state.nodes.every((entry) => entry.board === 'a')).toBe(true);
});

test('fitting a selection message trims the node map to the byte and count limits and drops oversized entries', () => {
  const base = {
    type: 'selection' as const,
    artifact: 'artboard/x',
    tab: 't',
    human: true,
    more: 0,
    tweaks: [],
  };
  const entry = (n: number, path = `body > div:nth-of-type(${n})`) => ({
    id: `a#${n}`,
    board: 'a',
    file: 'a.html',
    tag: 'div',
    path,
    name: '',
  });
  const selected = [
    { ...entry(1), text: '', html: '', tweaks: [] },
    { ...entry(2, 'x'.repeat(5000)), text: '', html: '', tweaks: [] },
  ];
  const nodes = [
    entry(3, 'y'.repeat(5000)),
    ...Array.from({ length: 30000 }, (_, i) => entry(i + 10)),
  ];
  const fitted = fitSelectionMessage({ ...base, selected, nodes }, 200_000);
  expect(fitted.selected.map((node) => node.id)).toEqual(['a#1']);
  expect(fitted.nodes.some((node) => node.id === 'a#3')).toBe(false);
  expect(fitted.nodes.length).toBeLessThanOrEqual(SELECTION_MAX_NODES);
  expect(new TextEncoder().encode(JSON.stringify(fitted)).length).toBeLessThanOrEqual(200_000);
  expect(fitted.nodes.length).toBeGreaterThan(0);
});
