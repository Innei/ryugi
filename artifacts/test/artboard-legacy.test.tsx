// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ArtboardView } from '../src/viewer/layouts/ArtboardView';

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

const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
const canvas = {
  version: 1,
  title: 'legacy',
  pages: [{ id: 'p', name: 'Page' }],
  boards: Object.fromEntries(
    ids.map((id, i) => [
      id,
      {
        file: `pages/p/${id}.html`,
        page: 'p',
        x: (i % 3) * 320,
        y: Math.floor(i / 3) * 260,
        w: 300,
        h: 240,
      },
    ]),
  ),
  groups: {},
  notes: {},
};
const layout = {
  pages: { p: { groups: {}, notes: {}, bounds: { minX: 0, minY: 0, maxX: 940, maxY: 500 } } },
};

let root: Root | undefined;
let host: HTMLDivElement | undefined;
beforeEach(() => {
  history.replaceState(null, '', '/artboard/legacy');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ signedIn: false, artifacts: {} }) }),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(extra: object = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const versions = Object.fromEntries(ids.map((id) => [`pages/p/${id}.html`, 1]));
  const view = createElement(ArtboardView, {
    id: 'legacy',
    artifact: null,
    canvas,
    layout,
    warnings: [],
    pending: [],
    contentBase: 'about:blank#',
    versions,
    loaded: true,
    ...extra,
  } as never);
  await act(async () =>
    root!.render(
      createElement(ConfigProvider, { motion, enableCustomFonts: false, children: view }),
    ),
  );
  return host;
}

const frames = () => host!.querySelectorAll('[data-board] iframe').length;

test('boards mount a couple at a time under their tiers', async () => {
  await mount();
  expect(frames()).toBe(2);
});

test('without tiers every visible board mounts its frame at once, as before snapshots existed', async () => {
  await mount({ tiers: false });
  expect(frames()).toBe(6);
});
