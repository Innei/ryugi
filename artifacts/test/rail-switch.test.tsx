// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { RailSwitch } from '../src/viewer/components/RailSwitch';

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

let root: Root | undefined;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot(document.body.appendChild(document.createElement('div')));
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function render(compact: boolean) {
  const props = {
    available: true,
    comments: 3,
    open: false,
    onComments() {},
    onHistory() {},
    compact,
  };
  await act(async () => root!.render(createElement(RailSwitch, props)));
  const [comments, history] = Array.from(document.querySelectorAll('button'));
  return [comments!, history!] as const;
}

test('the compact switch keeps only the comment count visible and names each tab for assistive tech', async () => {
  const [comments, history] = await render(true);
  expect(comments.textContent).toBe('3');
  expect(comments.getAttribute('aria-label')).toBe('Comments 3');
  expect(history.textContent).toBe('');
  expect(history.getAttribute('aria-label')).toBe('History');
});

test('the default switch keeps its text labels', async () => {
  const [comments, history] = await render(false);
  expect(comments.textContent).toBe('Comments 3');
  expect(history.textContent).toBe('History');
});
