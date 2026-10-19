import { describe, expect, test } from 'vitest';
import { injectRuntime } from '../src/server/inject';

describe('injectRuntime', () => {
  test('puts the runtime script first inside <head>, before the page\'s own scripts', () => {
    const out = injectRuntime('<!doctype html><html><HEAD><script>page()</script></HEAD></html>');
    const runtime = out.indexOf('ryugi:snapshot');
    expect(runtime).toBeGreaterThan(out.indexOf('<HEAD>'));
    expect(runtime).toBeLessThan(out.indexOf('page()'));
  });

  test('keeps every line of the page on its original line number', () => {
    const page = '<!doctype html>\n<html>\n<head>\n<title>x</title>\n</head>\n<body>\n<script>boom()</script>\n</body>\n</html>';
    const out = injectRuntime(page);
    expect(out.split('\n')).toHaveLength(page.split('\n').length);
    expect(out.split('\n')[6]).toBe('<script>boom()</script>');
  });

  test('the injected script is valid JavaScript', () => {
    const out = injectRuntime('<p>x</p>');
    const code = out.slice('<script>'.length, out.indexOf('</script>'));
    expect(() => new Function(code)).not.toThrow();
  });

  test('without <head>, the script goes after the doctype and <html> so the page stays in standards mode', () => {
    expect(injectRuntime('<!DOCTYPE html><meta charset=utf-8><title>x</title><p>y').startsWith('<!DOCTYPE html><script>')).toBe(true);
    expect(injectRuntime('<!doctype html>\n<html lang="en"><body>z').startsWith('<!doctype html>\n<html lang="en"><script>')).toBe(true);
  });

  test('prepends the script to a page without <head>', () => {
    const out = injectRuntime('<p>hello</p>');
    expect(out.startsWith('<script>')).toBe(true);
    expect(out.endsWith('<p>hello</p>')).toBe(true);
  });
});
