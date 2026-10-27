import { Window } from 'happy-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { injectRuntime } from '../src/server/inject';

const schema = {
  version: 1,
  controls: {
    accent: { type: 'color', default: '#b45309', label: 'Accent' },
    count: { type: 'range', default: 2, min: 0, max: 4, step: 1 },
    enabled: { type: 'boolean', default: false },
  },
};
let page: Window;

afterEach(async () => {
  await page?.happyDOM.close();
  vi.restoreAllMocks();
});

function load(declaration: unknown = schema, inspector = true) {
  page = new Window({
    settings: {
      enableJavaScriptEvaluation: true,
      suppressInsecureJavaScriptEnvironmentWarning: true,
    },
  });
  const reports: any[] = [];
  vi.spyOn(page.parent, 'postMessage').mockImplementation((data) => reports.push(data));
  page.document.write(
    injectRuntime(
      `<!doctype html><html><head><script type="application/json" data-ryugi-tweaks>${JSON.stringify(declaration)}</script></head><body><input id="unrelated" value="keep"><script>
    window.initialCount = window.ryugiTweaks?.count;
    window.eventValues = [];
    document.addEventListener('ryugi-tweaks', e => window.eventValues.push(e.detail));
  </script></body></html>`,
      { inspector },
    ),
  );
  const command = (data: object, source = page.parent) =>
    page.eval(
      `dispatchEvent(new MessageEvent('message', {source: ${source === page.parent ? 'parent' : '{}'}, data: ${JSON.stringify({ type: 'ryugi:tweaks', connection: 'current', ...data })}}))`,
    );
  command({ action: 'connect' });
  return {
    reports,
    command,
    ready: () => reports.filter((r) => r.type === 'ryugi:tweaks:ready').at(-1),
  };
}

test('declared defaults are available before author logic and reach CSS/data attributes', () => {
  load();
  expect((page as any).initialCount).toBe(2);
  expect((page as any).ryugiTweaks).toEqual({ accent: '#b45309', count: 2, enabled: false });
  expect(page.document.documentElement.style.getPropertyValue('--tweak-count')).toBe('2');
  expect(page.document.documentElement.getAttribute('data-tweak-enabled')).toBe('false');
});

test('a current parent command updates CSS and JS without replacing the document', () => {
  const { command, ready } = load();
  const input = page.document.getElementById('unrelated')!;
  const values = { accent: '#355ecb', count: 4, enabled: true };
  command({ action: 'set', session: ready()?.session, values });
  expect((page as any).ryugiTweaks).toEqual(values);
  expect((page as any).eventValues.at(-1)).toEqual(values);
  expect(page.document.documentElement.style.getPropertyValue('--tweak-accent')).toBe('#355ecb');
  expect(page.document.getElementById('unrelated')).toBe(input);
  expect(input.getAttribute('value')).toBe('keep');
});

test('foreign senders, stale sessions/connections and invalid values cannot mutate parameters', () => {
  const { command, ready } = load();
  const values = { accent: '#355ecb', count: 4, enabled: true };
  command({ action: 'set', session: ready()?.session, values }, {} as Window);
  command({ action: 'set', session: 'retired', values });
  command({ action: 'set', connection: 'retired', session: ready()?.session, values });
  command({ action: 'set', session: ready()?.session, values: { ...values, count: 999 } });
  expect((page as any).ryugiTweaks?.count).toBe(2);
  expect((page as any).ryugiTweaks?.accent).toBe('#b45309');
  expect((page as any).eventValues).toEqual([]);
});

test('author handlers cannot mutate the stored values through the public object or event detail', () => {
  const { command, ready } = load();
  const exposed = (page as any).ryugiTweaks;
  if (exposed) exposed.count = 999;
  page.document.addEventListener('ryugi-tweaks', ((event: any) => {
    event.detail.count = 999;
  }) as any);
  command({
    action: 'set',
    session: ready()?.session,
    values: { accent: '#b45309', count: 3, enabled: false },
  });
  expect((page as any).ryugiTweaks?.count).toBe(3);
});

test('invalid declarations report an error and do not run declarative code', () => {
  const { ready } = load({
    version: 1,
    controls: { count: { type: 'range', default: 99, min: 0, max: 4 } },
  });
  expect(ready()?.error).toMatch(/count|default/i);
  expect(ready()?.schema).toBeNull();
  expect((page as any).ryugiTweaks).toEqual({});
});

test('an HTML artifact does not gain artboard parameter commands', () => {
  const { ready } = load(schema, false);
  expect(ready()).toBeUndefined();
  expect((page as any).ryugiTweaks).toBeUndefined();
});

test('duplicate declarations report an error and recover when the duplicate is removed', () => {
  const { command, ready } = load();
  const extra = page.document.createElement('script');
  extra.type = 'application/json';
  extra.setAttribute('data-ryugi-tweaks', '');
  extra.textContent = JSON.stringify(schema);
  page.document.head.append(extra);
  command({ action: 'connect' });
  expect(ready()?.error).toMatch(/one/);
  extra.remove();
  command({ action: 'connect' });
  expect(ready()?.error).toBeNull();
  expect((page as any).ryugiTweaks.count).toBe(2);
});
