// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';

import { injectRuntime } from '../src/server/inject';

afterEach(() => vi.restoreAllMocks());

function install() {
  const out = injectRuntime('<head></head>', {});
  const script = /<script>([\s\S]*?)<\/script>/.exec(out)![1]!;
  const posted: unknown[] = [];
  vi.spyOn(window.parent, 'postMessage').mockImplementation((message) => posted.push(message));
  new Function(script)();
  return posted;
}

const ask = (source: MessageEventSource | null) =>
  window.dispatchEvent(new MessageEvent('message', { source, data: { type: 'ryugi:snapshot' } }));

test('the page state goes to its parent when the parent asks', () => {
  const posted = install();
  ask(window.parent);
  expect(posted).toContainEqual(expect.objectContaining({ type: 'ryugi:state' }));
});

test('a window other than the parent cannot read the page state', () => {
  const posted = install();
  ask(null);
  expect(posted).not.toContainEqual(expect.objectContaining({ type: 'ryugi:state' }));
});
