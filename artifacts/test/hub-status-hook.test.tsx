// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { HUB_STATUS_POLL_MS, useHubStatus } from '../src/viewer/hooks/useHubStatus';

let root: Root | null = null;
let versions: Array<string | null> = [];
const requested: string[] = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.useFakeTimers();
  requested.length = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    requested.push(url);
    const version = versions.shift();
    if (version === null) return new Response('Forbidden', { status: 403 });
    return new Response(JSON.stringify({ version }), { status: 200 });
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function Probe() {
  const { status, offline } = useHubStatus();
  return createElement('span', null, offline ? 'offline' : (status?.version ?? 'none'));
}

async function render() {
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(createElement(Probe)));
  return host;
}

test('reads the machine server status and polls it', async () => {
  versions = ['1.0.0', '1.1.0'];
  const host = await render();
  expect(requested).toEqual(['/api/status']);
  expect(host.textContent).toBe('1.0.0');
  await act(async () => vi.advanceTimersByTimeAsync(HUB_STATUS_POLL_MS));
  expect(requested).toHaveLength(2);
  expect(host.textContent).toBe('1.1.0');
});

test('a refused status reads as offline', async () => {
  versions = [null];
  const host = await render();
  expect(host.textContent).toBe('offline');
});
