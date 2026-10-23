// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { emitServerMessage } from '../src/viewer/hooks/useArtifactSocket';
import { useCloudSync } from '../src/viewer/hooks/useCloudSync';

let root: Root | null = null;
let answers: Array<boolean | null> = [];
const requested: string[] = [];

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.useFakeTimers();
  requested.length = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    requested.push(url);
    return new Response(JSON.stringify({ upToDate: answers.shift() ?? null }), { status: 200 });
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function Probe({ artifact, enabled }: { artifact: string; enabled: boolean }) {
  const { upToDate } = useCloudSync(artifact, enabled);
  return createElement('span', null, String(upToDate));
}

async function render(enabled = true) {
  const host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root!.render(createElement(Probe, { artifact: 'artboard/b', enabled })));
  return host;
}

test('asks the local server whether the cloud copy is up to date', async () => {
  answers = [true];
  const host = await render();
  expect(requested).toEqual(['/api/cloud/sync/artboard/b']);
  expect(host.textContent).toBe('true');
});

test('asks nothing while the artifact is not published', async () => {
  const host = await render(false);
  expect(requested).toEqual([]);
  expect(host.textContent).toBe('null');
});

test('asks again shortly after a burst of local changes, once', async () => {
  answers = [true, false];
  const host = await render();
  await act(async () => {
    emitServerMessage({ type: 'change', artifact: 'artboard/b', files: ['canvas.json'] });
    emitServerMessage({ type: 'change', artifact: 'artboard/b', files: ['pages/p/a.html'] });
    emitServerMessage({ type: 'change', artifact: 'artboard/other', files: [] });
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(requested).toHaveLength(2);
  expect(host.textContent).toBe('false');
});

test('asks again when an auto-publish of this artifact lands', async () => {
  answers = [false, true];
  const host = await render();
  await act(async () => {
    emitServerMessage({ type: 'cloud-published', artifact: 'artboard/b' });
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(host.textContent).toBe('true');
});
