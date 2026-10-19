import { describe, expect, test } from 'vitest';
import { injectRuntime } from '../src/server/inject';

describe('injectRuntime', () => {
  test('puts the runtime script first inside <head>, before the page\'s own scripts', () => {
    const out = injectRuntime('<!doctype html><html><HEAD><script>page()</script></HEAD></html>');
    const runtime = out.indexOf('ryugi:snapshot');
    expect(runtime).toBeGreaterThan(out.indexOf('<HEAD>'));
    expect(runtime).toBeLessThan(out.indexOf('page()'));
  });

  test('injects the UI runtime for custom elements when a runtime URL is given', () => {
    const url = '/c/token/runtime/ryugi-ui.js';
    const out = injectRuntime('<html><head></head><body><ryugi-button>Go</ryugi-button></body></html>', {
      uiRuntimeUrl: url,
    });
    expect(out).toContain(`<script defer src="${url}"></script>`);
    expect(out.indexOf('ryugi:snapshot')).toBeLessThan(out.indexOf('ryugi-ui.js'));
  });

  test('injects the UI runtime for a meta opt-in and not for plain pages', () => {
    const url = '/c/token/runtime/ryugi-ui.js';
    expect(injectRuntime('<meta name="ryugi-ui" content="1">', { uiRuntimeUrl: url })).toContain('ryugi-ui.js');
    expect(injectRuntime('<p>plain</p>', { uiRuntimeUrl: url })).not.toContain('ryugi-ui.js');
    expect(injectRuntime('<ryugi-button>Go</ryugi-button>')).not.toContain('ryugi-ui.js');
  });

  test('keeps line numbers when the UI runtime is injected too', () => {
    const page = '<!doctype html>\n<html>\n<head>\n<title>x</title>\n</head>\n<body>\n<ryugi-button>Go</ryugi-button>\n</body>\n</html>';
    const out = injectRuntime(page, { uiRuntimeUrl: '/c/token/runtime/ryugi-ui.js' });
    expect(out.split('\n')).toHaveLength(page.split('\n').length);
    expect(out.split('\n')[6]).toBe('<ryugi-button>Go</ryugi-button>');
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
