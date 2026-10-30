// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import type { CloudStatus } from '../src/shared/cloud';
import { AutoPublishPrompt } from '../src/viewer/components/AutoPublishPrompt';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
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

const status = (signedIn: boolean, global: boolean | null, postponed = false): CloudStatus => ({
  signedIn,
  login: signedIn ? 'innei' : null,
  origin: 'https://ryugi.innei.dev',
  artifacts: {},
  autoPublish: { global, project: null, enabled: false, postponed },
  warning: null,
});

function render(value: CloudStatus | null, onAnswer = vi.fn(async () => {})) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(createElement(AutoPublishPrompt, { status: value, onAnswer })));
  return { host, onAnswer };
}

const button = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === text)!;

test('asks a signed-in partner who has not decided', () => {
  const { host } = render(status(true, null));
  expect(host.textContent).toContain('auto-publish');
  expect(host.textContent).toContain('privately');
});

test('turns it on, or postpones the question', async () => {
  const { host, onAnswer } = render(status(true, null));
  await act(async () => button(host, 'Turn on').click());
  expect(onAnswer).toHaveBeenCalledWith('on');
  await act(async () => button(host, 'Not now').click());
  expect(onAnswer).toHaveBeenCalledWith('later');
});

test('stays hidden when signed out, decided, postponed, or still loading', () => {
  for (const value of [
    status(false, null),
    status(true, true),
    status(true, false),
    status(true, null, true),
    null,
  ]) {
    const { host } = render(value);
    expect(host.textContent).toBe('');
    act(() => root?.unmount());
  }
});
