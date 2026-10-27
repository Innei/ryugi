// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { withCloudRuntime } from '../src/server/publish-payload';

afterEach(() => vi.restoreAllMocks());

test('published artboard HTML can inspect live nodes while binary assets stay untouched', () => {
  const asset = { path: 'pages/a/photo.png', data: Buffer.from([0, 1, 2]) };
  const files = withCloudRuntime('artboard', [
    {
      path: 'pages/a/index.html',
      data: Buffer.from('<!doctype html><main>Published board</main>'),
    },
    asset,
  ]);
  const page = new DOMParser().parseFromString(files[0]!.data.toString(), 'text/html');
  const script = page.querySelector('script');
  expect(script).not.toBeNull();
  document.body.innerHTML = '<main>Published board</main>';
  const posted: any[] = [];
  vi.spyOn(window.parent, 'postMessage').mockImplementation((value) => posted.push(value));
  new Function(script!.textContent!)();
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: { type: 'ryugi:inspect', action: 'enable', connection: 'cloud-test' },
    }),
  );
  expect(
    posted
      .find((value) => value.type === 'ryugi:inspect:tree')
      ?.nodes.some((node: { name: string }) => node.name === 'Published board'),
  ).toBe(true);
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window.parent,
      data: { type: 'ryugi:inspect', action: 'disable', connection: 'cloud-test' },
    }),
  );
  expect(files[1]).toBe(asset);
});
