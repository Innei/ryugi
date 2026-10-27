// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { BoardSpec } from '../src/shared/types';
import { useKeptBoards } from '../src/viewer/hooks/useKeptBoards';

let root: Root;
let kept: ReadonlySet<string>;
let props: {
  boards: [string, BoardSpec][];
  versions: Record<string, number>;
  accepts?: (id: string) => boolean;
};
const spec = (id: string): BoardSpec => ({
  file: `pages/${id}.html`,
  page: 'p',
  x: 0,
  y: 0,
  w: 100,
  h: 100,
});

function Harness() {
  kept = useKeptBoards(props.boards, props.versions, props.accepts);
  return null;
}
const render = async (patch: Partial<typeof props> = {}) => {
  props = { ...props, ...patch };
  await act(async () => root.render(createElement(Harness)));
};
const frameOf = (id: string) => {
  const slot = document.createElement('div');
  slot.dataset.board = id;
  const frame = document.createElement('iframe');
  slot.append(frame);
  document.body.append(slot);
  return frame;
};
const interact = async (frame: HTMLIFrameElement, type = 'ryugi:board:interacted') => {
  await act(async () => {
    window.dispatchEvent(
      new MessageEvent('message', { source: frame.contentWindow, data: { type } }),
    );
  });
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  props = {
    boards: [
      ['a', spec('a')],
      ['b', spec('b')],
    ],
    versions: { 'pages/a.html': 1, 'pages/b.html': 1 },
  };
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

test('a board whose frame reports an interaction is kept', async () => {
  await render();
  const a = frameOf('a');
  frameOf('b');
  await interact(a, 'ryugi:board:changed');
  expect([...kept]).toEqual([]);
  await interact(a);
  expect([...kept]).toEqual(['a']);
});

test('a kept board that the agent rewrites stops being kept', async () => {
  await render();
  await interact(frameOf('a'));
  await render({ versions: { 'pages/a.html': 2, 'pages/b.html': 1 } });
  expect([...kept]).toEqual([]);
});

test('a press the inspector takes for selecting does not keep the board', async () => {
  await render({ accepts: (id) => id === 'b' });
  await interact(frameOf('a'));
  expect([...kept]).toEqual([]);
  await interact(frameOf('b'));
  expect([...kept]).toEqual(['b']);
});
