// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import type { BoardSpec } from '../src/shared/types';
import { ExpandedBoard } from '../src/viewer/components/ExpandedBoard';
import { Labels } from '../src/viewer/components/Labels';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  defineConsts: (value: unknown) => value,
  defineVars: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

async function render(element: ReturnType<typeof createElement>) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(ConfigProvider, { motion, enableCustomFonts: false, children: element }),
    ),
  );
  return host;
}

const shot: BoardSpec = {
  type: 'image',
  src: 'pages/p/notify-after.png',
  file: 'pages/p/notify-after.png',
  page: 'p',
  x: 0,
  y: 0,
  w: 640,
  h: 400,
  title: '实际截图',
};
const flow: BoardSpec = {
  type: 'video',
  src: 'pages/p/notify-flow.webm',
  file: 'pages/p/notify-flow.webm',
  page: 'p',
  x: 700,
  y: 0,
  w: 640,
  h: 400,
};

test('a media board label names its file and marks its type', async () => {
  const host = await render(
    createElement(Labels, {
      view: { x: 0, y: 0, k: 1 },
      boards: [
        ['shot', shot],
        ['flow', flow],
      ],
      groups: [],
      allBoards: { shot, flow },
      contentBase: 'about:blank#',
      versions: { 'pages/p/notify-after.png': 1, 'pages/p/notify-flow.webm': 1 },
      pending: new Set<string>(),
      playing: new Set<string>(),
      onExpand: () => {},
      onTogglePlay: () => {},
      onReplay: () => {},
    }),
  );
  const labels = [...host.querySelectorAll('[data-chrome="board-label"]')];
  expect(labels[0]!.textContent).toContain('notify-after.png');
  expect(labels[0]!.querySelector('[data-board-type="image"]')).not.toBeNull();
  expect(labels[1]!.querySelector('[data-board-type="video"]')).not.toBeNull();
});

test('an expanded media board shows the media, with the player for video', async () => {
  const image = await render(
    createElement(ExpandedBoard, {
      id: 'shot',
      board: shot,
      src: 'about:blank#pages/p/notify-after.png?v=1',
      interactive: false,
      onClose: () => {},
    }),
  );
  expect(image.querySelector('img')?.getAttribute('src')).toBe(
    'about:blank#pages/p/notify-after.png?v=1',
  );
  act(() => root?.unmount());
  const video = await render(
    createElement(ExpandedBoard, {
      id: 'flow',
      board: flow,
      src: 'about:blank#pages/p/notify-flow.webm?v=1',
      interactive: false,
      onClose: () => {},
    }),
  );
  expect(video.querySelector('iframe')).toBeNull();
  expect(video.querySelector('video')).not.toBeNull();
  expect(video.querySelector('[aria-label="Play"]')).not.toBeNull();
  expect(video.querySelector('[aria-label="Expand"]')).toBeNull();
});
