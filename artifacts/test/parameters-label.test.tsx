// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { Labels } from '../src/viewer/components/Labels';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  defineVars: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

test('a phone-sized HTML board exposes Parameters at 100% zoom', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const board = { file: 'pages/today.html', page: 'p', x: 0, y: 0, w: 390, h: 844 };
  try {
    await act(async () =>
      root.render(
        createElement(ConfigProvider, {
          motion,
          enableCustomFonts: false,
          children: createElement(Labels, {
            view: { x: 0, y: 0, k: 1 },
            boards: [['today', board]],
            groups: [],
            allBoards: { today: board },
            contentBase: '/',
            versions: { 'pages/today.html': 1 },
            pending: new Set<string>(),
            playing: new Set<string>(),
            parameters: { today: 4 },
            onExpand: () => {},
            onTogglePlay: () => {},
            onReplay: () => {},
          }),
        }),
      ),
    );
    expect(host.querySelector('button[aria-label="Parameters today"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
