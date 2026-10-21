// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { PhoneArtboard } from '../src/viewer/layouts/PhoneArtboard';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}), defineConsts: (value: unknown) => value, defineVars: (value: unknown) => value }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('../src/viewer/components/Canvas', () => ({ Canvas: () => null }));
vi.mock('../src/viewer/components/Labels', () => ({ Labels: () => null }));
vi.mock('../src/viewer/components/PhoneBoard', () => ({ PhoneBoard: () => null }));
vi.mock('../src/viewer/components/QuestionSheet', () => ({ QuestionSheet: () => null, SHEET_PEEK: 48 }));
vi.mock('../src/viewer/components/PhoneArtboardBar', () => ({
  PhoneArtboardBar: (props: { artifact: string | null }) => createElement('div', { 'data-bar': props.artifact ?? 'none' }),
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

async function render(menu?: boolean) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const props = { id: 'b', artifact: 'artboard/b', canvas: null, layout: null, warnings: [], pending: [], contentBase: '', versions: {}, loaded: true, ...(menu === undefined ? {} : { menu }) };
  await act(async () => root!.render(createElement(PhoneArtboard, props)));
  return host.querySelector<HTMLElement>('[data-bar]')!.dataset.bar;
}

test('the phone bar offers the publish menu locally and hides it on the cloud page', async () => {
  expect(await render()).toBe('artboard/b');
  act(() => root?.unmount());
  expect(await render(false)).toBe('none');
});
