// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { HubStatus } from '../src/shared/hub';
import { formatUptime } from '../src/viewer/layouts/home/status-format';
import { StatusPill } from '../src/viewer/layouts/home/StatusPill';

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

const status = (latest: string | null): HubStatus => ({
  pid: 1,
  version: '1.0.0',
  latest,
  startedAt: Date.now() - 3 * 3600_000,
  lastActivity: Date.now(),
  clients: 2,
  port: 27319,
  boardPort: 27329,
  url: 'http://localhost:27319/',
  relay: { connected: true, announced: 23 },
  live: { local: 6, relay: 1 },
  projects: [
    { dir: '/p/ryugi', name: 'ryugi', lastUsedAt: 0, dormant: false, artifacts: 31 },
    { dir: '/p/old-blog', name: 'old-blog', lastUsedAt: 0, dormant: true, artifacts: 4 },
  ],
});

let root: Root | null = null;
let host: HTMLElement;
let latest: string | null = null;
const requests: { url: string; method: string; body?: string }[] = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  requests.length = 0;
  latest = null;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    requests.push({ url, method: init?.method ?? 'GET', body: init?.body as string | undefined });
    if (url === '/api/status') return new Response(JSON.stringify(status(latest)));
    if (url.startsWith('/api/hub/log'))
      return new Response(JSON.stringify({ lines: ['{"project":"/p/ryugi"}'] }));
    return new Response(JSON.stringify({ ok: true }), { status: 202 });
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
});

async function render() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ConfigProvider enableCustomFonts={false} motion={motion}>
        <StatusPill />
      </ConfigProvider>,
    ),
  );
  await act(async () => {});
}

const button = (name: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(name));
const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await act(async () => {});
};

test('the pill shows the version, the relay and an update badge when a release is newer', async () => {
  latest = '1.1.0';
  await render();
  const pill = host.querySelector('button[aria-expanded]')!;
  expect(pill.textContent).toContain('v1.0.0');
  expect(pill.textContent).toContain('relay connected');
  expect(pill.textContent).toContain('Update');
});

test('no update badge when the server is current', async () => {
  await render();
  expect(host.querySelector('button[aria-expanded]')!.textContent).not.toContain('Update');
});

test('the panel lists the server state and projects, and stop calls the server', async () => {
  latest = '1.1.0';
  await render();
  await click(host.querySelector('button[aria-expanded]')!);
  const panel = host.querySelector('[role="dialog"]')!;
  expect(panel.textContent).toContain('localhost:27319');
  expect(panel.textContent).toContain('23');
  expect(panel.textContent).toContain('old-blog');
  expect(panel.textContent).toContain('1.1.0');
  await click(button('Stop')!);
  expect(requests.some((r) => r.url === '/api/hub/stop' && r.method === 'POST')).toBe(true);
});

test('upgrade and restart call the server', async () => {
  latest = '1.1.0';
  await render();
  await click(host.querySelector('button[aria-expanded]')!);
  await click(button('Upgrade and restart')!);
  await click(button('Restart')!);
  expect(requests.filter((r) => r.method === 'POST').map((r) => r.url)).toEqual([
    '/api/hub/upgrade',
    '/api/hub/restart',
  ]);
});

test('removing a project from the panel forgets it', async () => {
  await render();
  await click(host.querySelector('button[aria-expanded]')!);
  await click(host.querySelector('button[aria-label="Remove old-blog"]')!);
  expect(requests.find((r) => r.method === 'DELETE')).toEqual({
    url: '/api/hub/projects',
    method: 'DELETE',
    body: JSON.stringify({ dir: '/p/old-blog' }),
  });
});

test('the log opens from the panel', async () => {
  await render();
  await click(host.querySelector('button[aria-expanded]')!);
  await click(button('View log')!);
  expect(requests.some((r) => r.url === '/api/hub/log')).toBe(true);
  expect(host.querySelector('pre')!.textContent).toContain('/p/ryugi');
});

test('uptime reads in days and hours, or hours and minutes', () => {
  expect(formatUptime(3 * 86400_000 + 4 * 3600_000, 'en')).toBe('3d 4h');
  expect(formatUptime(2 * 3600_000 + 5 * 60_000, 'en')).toBe('2h 5m');
  expect(formatUptime(30_000, 'en')).toBe('0m');
});
