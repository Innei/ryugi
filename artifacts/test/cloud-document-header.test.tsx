// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { TopBar } from '../src/viewer/document/TopBar';

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
vi.mock('../src/viewer/components/PublishMenu', () => ({ PublishMenu: () => null }));

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

const props = {
  id: 'c1',
  agent: 'Codex',
  activity: { kind: 'editing' } as const,
  agentSection: '1. 结论',
  offline: false,
  openComments: 2,
  cloud: { online: true, canEdit: true, reason: null },
};

async function render(extra = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(TopBar, { ...props, ...extra })));
  return host;
}

test('an embedded cloud document moves its status to the shell instead of adding a second header', async () => {
  const postMessage = vi.fn();
  vi.stubGlobal('parent', { postMessage });
  const host = await render();
  expect(host.querySelector('header')).toBeNull();
  expect(postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      type: 'ryugi:cloud-header',
      id: 'c1',
      online: true,
      comments: 2,
      activity: 'Codex is editing 1. 结论',
      activityTone: 'live',
    }),
    location.origin,
  );
  await act(async () =>
    root!.render(
      createElement(TopBar, {
        ...props,
        activity: { kind: 'idle' } as const,
        offline: true,
        openComments: 0,
        cloud: { online: false, canEdit: false, reason: '版本不同' },
      }),
    ),
  );
  expect(postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      online: false,
      comments: 0,
      activity: null,
      retrying: true,
      reason: '版本不同',
    }),
    location.origin,
  );
});

test('standalone documents keep their toolbar', async () => {
  const host = await render({ cloud: undefined });
  expect(host.querySelector('header')).not.toBeNull();
  expect(host.textContent).toContain('document / c1');
});

test('an embedded document reports its history availability to the outer header', async () => {
  const postMessage = vi.fn();
  vi.stubGlobal('parent', { postMessage });
  await render({ history: { available: true, open: false, toggle: () => {}, close: () => {} } });
  expect(postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ history: true, historyOpen: false }),
    location.origin,
  );
});

test('the phone editing toolbar still lets the human partner finish editing', async () => {
  vi.stubGlobal('parent', { postMessage: vi.fn() });
  const onDone = vi.fn();
  const host = await render({ compact: true, onDone });
  const done = Array.from(host.querySelectorAll('button')).find(
    (button) => button.textContent === 'Done',
  );
  expect(done).toBeDefined();
  act(() => done!.click());
  expect(onDone).toHaveBeenCalledOnce();
});
