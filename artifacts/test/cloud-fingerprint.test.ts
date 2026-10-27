import { afterEach, expect, test, vi } from 'vitest';

import { call, closeAll, start } from './fake-cloud';
import { writeHtml } from './helpers';

const runtime = vi.hoisted(() => ({ release: 1 }));

vi.mock('../src/server/inject', async (original) => {
  const actual = await original<typeof import('../src/server/inject')>();
  return {
    ...actual,
    injectRuntime: (...args: Parameters<typeof actual.injectRuntime>) =>
      `${actual.injectRuntime(...args)}<!-- runtime ${runtime.release} -->`,
  };
});

afterEach(closeAll);

test('a newer viewer runtime does not make a published copy look out of date', async () => {
  const { server, root } = await start();
  writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
  await call(server, 'POST', '/api/cloud/publish/html/a');
  runtime.release = 2;
  expect((await call(server, 'GET', '/api/cloud/sync/html/a')).json).toEqual({ upToDate: true });
});
