// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { CanvasLayout, CanvasSpec } from '../src/shared/types';
import { useArtboardPage } from '../src/viewer/hooks/useArtboardPage';

const canvas: CanvasSpec = {
  version: 1,
  pages: [
    { id: 'first', name: 'First' },
    { id: 'review', name: 'Review' },
  ],
  boards: {},
  activePage: 'first',
};
const layout: CanvasLayout = { pages: {} };
let root: Root | undefined;
let current: ReturnType<typeof useArtboardPage>;
const fitPage = vi.fn(() => true);
const fitFocus = vi.fn();

function Page({ spec }: { spec: CanvasSpec | null }) {
  current = useArtboardPage({ canvas: spec, layout: spec ? layout : null, fitPage, fitFocus });
  return createElement('output', null, current.page);
}
async function render(spec: CanvasSpec | null = canvas) {
  await act(async () => root!.render(createElement(Page, { spec })));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  history.replaceState({ keep: true }, '', '/artboard/abc?key=local-key');
  root = createRoot(document.body.appendChild(document.createElement('div')));
  fitPage.mockClear();
  fitFocus.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

test('a page link wins over the saved active page after the canvas loads', async () => {
  history.replaceState(null, '', '/artboard/abc?key=local-key&page=review');
  await render(null);
  await render();
  expect(current.page).toBe('review');
  expect(fitPage).toHaveBeenLastCalledWith('review');
});

test('switching pages records navigation and popstate restores the page without overwriting history', async () => {
  await render();
  expect(location.search).toBe('?key=local-key&page=first');
  const before = history.length;
  await act(async () => current.changePage('review'));
  expect(location.search).toBe('?key=local-key&page=review');
  expect(history.state).toEqual({ keep: true });
  expect(history.length).toBe(before + 1);
  await act(async () => current.changePage('review'));
  expect(history.length).toBe(before + 1);
  await act(async () => {
    history.replaceState(history.state, '', '/artboard/abc?key=local-key&page=first');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(current.page).toBe('first');
  expect(fitPage).toHaveBeenLastCalledWith('first');
  expect(location.search).toBe('?key=local-key&page=first');
});

test.each(['missing', ''])(
  'invalid page %j and deleted pages fall back to an existing page and repair the URL',
  async (requested) => {
    history.replaceState(null, '', `/artboard/abc?page=${requested}`);
    await render({ ...canvas, activePage: 'review' });
    expect(current.page).toBe('first');
    expect(location.search).toBe('?page=first');
    await act(async () => current.changePage('review'));
    await render({ ...canvas, pages: [canvas.pages[0]!] });
    expect(current.page).toBe('first');
    expect(location.search).toBe('?page=first');
  },
);

test('agent page changes replace the address while preserving other parameters and fragments', async () => {
  history.replaceState(null, '', '/artboard/abc?page=first&other=keep#note');
  await render();
  const before = history.length;
  await render({ ...canvas, activePage: 'review' });
  expect(current.page).toBe('review');
  expect(location.search).toBe('?page=review&other=keep');
  expect(location.hash).toBe('#note');
  expect(history.length).toBe(before);
});

test('clearing the agent active page preserves the page the human partner chose', async () => {
  await render();
  await act(async () => current.changePage('review'));
  await render({ ...canvas, activePage: undefined });
  expect(current.page).toBe('review');
  expect(location.search).toBe('?key=local-key&page=review');
});
