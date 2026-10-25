// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from 'react';
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
  PhoneArtboardBar: (props: { actions?: ReactNode }) => createElement('div', { 'data-bar': 'bar' }, props.actions),
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

async function render(actions?: ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const props = { id: 'b', artifact: 'artboard/b', canvas: null, layout: null, warnings: [], pending: [], contentBase: '', versions: {}, loaded: true, actions };
  await act(async () => root!.render(createElement(PhoneArtboard, props)));
  return host.querySelector<HTMLElement>('[data-bar]')!.innerHTML;
}

test('the phone bar shows the actions the local app passes and nothing on the cloud page', async () => {
  expect(await render(createElement('button', null, 'Publish'))).toBe('<button>Publish</button>');
  act(() => root?.unmount());
  expect(await render()).toBe('');
});
