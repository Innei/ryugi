// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { CloudShell } from '../src/viewer/layouts/CloudShell';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}), defineConsts: (value: unknown) => value, defineVars: (value: unknown) => value }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('../src/viewer/components/CloudBanner', () => ({ OwnerBanner: () => null, VisitorBanner: () => null }));

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

test('the artifact frame is allowed to reach this computer', async () => {
  vi.stubGlobal('fetch', async () => Response.json({ title: 'Page', owner: true, visibility: 'private' }));
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(CloudShell, { id: 'c1' })));
  const allow = host.querySelector('iframe')!.getAttribute('allow')!.split(';').map((part) => part.trim());
  expect(allow).toEqual(expect.arrayContaining(['clipboard-write', 'local-network-access', 'loopback-network']));
});
