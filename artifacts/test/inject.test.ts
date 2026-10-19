import { describe, expect, test } from 'vitest';
import { injectRuntime } from '../src/server/inject';

describe('injectRuntime', () => {
  test('puts the runtime script first inside <head>, before the page\'s own scripts', () => {
    const out = injectRuntime('<!doctype html><html><HEAD><script>page()</script></HEAD></html>');
    const runtime = out.indexOf('ryugi:snapshot');
    expect(runtime).toBeGreaterThan(out.indexOf('<HEAD>'));
    expect(runtime).toBeLessThan(out.indexOf('page()'));
  });

  test('prepends the script to a page without <head>', () => {
    const out = injectRuntime('<p>hello</p>');
    expect(out.startsWith('<script>')).toBe(true);
    expect(out.endsWith('<p>hello</p>')).toBe(true);
  });
});
