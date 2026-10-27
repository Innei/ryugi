// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { PreviewLayout } from '../src/viewer/layouts/PreviewLayout';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
  defineConsts: (value: unknown) => value,
  defineVars: (value: unknown) => value,
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));
vi.mock('../src/viewer/components/Canvas', () => ({ Canvas: () => null }));

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function renderWith(element: ReturnType<typeof createElement>, body: unknown) {
  const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(body)));
  vi.stubGlobal('fetch', fetch);
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  for (let i = 0; i < 5; i++) await act(async () => {});
  return { host, fetch };
}

test('the local preview fetches its artifact once', async () => {
  const { fetch } = await renderWith(createElement(PreviewLayout, { type: 'html', id: 'a' }), {
    title: 'A',
    contentBase: '/c/',
    warnings: ['waiting'],
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
