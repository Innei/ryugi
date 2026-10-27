import { describe, expect, test } from 'vitest';
import { injectRuntime } from '../src/server/inject';
import { CLOUD_RUNTIME_URL } from '../src/server/publish-payload';
import { stripRuntime } from '../src/server/strip-runtime';

const page =
  '<!doctype html><html><head><title>Arrow</title><script>window.mine = 1</script></head><body><ryugi-button>Go</ryugi-button><ryugi-icon name="x"></ryugi-icon></body></html>';

describe('stripRuntime', () => {
  test.each([
    ['an artboard page', { uiRuntimeUrl: CLOUD_RUNTIME_URL, inspector: true }],
    ['an HTML page with UI and icons', { uiRuntimeUrl: CLOUD_RUNTIME_URL }],
    ['a document live block', { uiRuntimeUrl: CLOUD_RUNTIME_URL, embedded: true }],
    ['a page without a runtime URL', {}],
  ])('gives back the authored source of %s', (_name, options) => {
    expect(stripRuntime(injectRuntime(page, options))).toBe(page);
  });

  test('works without a <head>', () => {
    const bare = '<p>hello</p>';
    expect(stripRuntime(injectRuntime(bare, { inspector: true }))).toBe(bare);
  });

  test('leaves a page that was never injected alone', () => {
    expect(stripRuntime(page)).toBe(page);
  });
});
