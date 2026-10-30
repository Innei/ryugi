// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { useBoardTweaks } from '../src/viewer/hooks/useBoardTweaks';
import { revealTweakPanel, tweakPanelAnchor, TweaksPanel } from '../src/viewer/tweaks/TweaksPanel';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  defineConsts: (value: unknown) => value,
  defineVars: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

let current: ReturnType<typeof useBoardTweaks>;
let root: Root;
let host: HTMLDivElement;
const initial = {
  version: 1,
  controls: { count: { type: 'range', default: 2, min: 0, max: 8, step: 1, label: 'Count' } },
};
const messages = new Map<HTMLIFrameElement, any[]>();
const closed = vi.fn();

function Harness({
  artifact = 'one',
  expanded = false,
  panel = false,
  zoom = 0.5,
}: {
  artifact?: string;
  expanded?: boolean;
  panel?: boolean;
  zoom?: number;
}) {
  current = useBoardTweaks(artifact);
  return (
    <>
      {['a', 'b'].map((id) => (
        <iframe
          data-frame={id}
          key={id}
          ref={current.refFor(id)}
          src="about:blank"
          onLoad={() => current.loaded(id)}
        />
      ))}
      {expanded && (
        <iframe
          data-frame="expanded"
          ref={current.refFor('a', 'expanded')}
          src="about:blank"
          onLoad={() => current.loaded('a', 'expanded')}
        />
      )}
      {panel && current.states.a && (
        <TweaksPanel
          anchor={tweakPanelAnchor({ x: 10, y: 20, w: 400, h: 300 }, { x: 100, y: 50, k: zoom })}
          boardId="a"
          state={current.states.a}
          title="First board"
          onChange={(key, value) => current.change('a', key, value)}
          onClose={closed}
          onReset={() => current.reset('a')}
        />
      )}
    </>
  );
}

async function render(props = {}) {
  await act(async () =>
    root.render(
      createElement(ConfigProvider, {
        motion,
        enableCustomFonts: false,
        children: createElement(Harness, props),
      }),
    ),
  );
}
const frame = (id: string) => host.querySelector<HTMLIFrameElement>(`[data-frame="${id}"]`)!;
async function connect(id: string) {
  const el = frame(id);
  if (!messages.has(el)) {
    messages.set(el, []);
    vi.spyOn(el.contentWindow!, 'postMessage').mockImplementation((data) =>
      messages.get(el)!.push(data),
    );
  }
  await act(async () => el.dispatchEvent(new Event('load')));
  return messages
    .get(el)!
    .filter((m) => m.action === 'connect')
    .at(-1).connection as string;
}
async function report(
  id: string,
  connection: string,
  schema: unknown = initial,
  session = id,
  source = frame(id).contentWindow!,
) {
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        source,
        data: { type: 'ryugi:tweaks:ready', connection, session, schema, error: null },
      }),
    ),
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  messages.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('registered frames update live without replacement and keep board values independent', async () => {
  await render();
  await report('a', await connect('a'));
  await report('b', await connect('b'));
  const original = frame('a');
  await act(async () => current.change('a', 'count', 4));
  expect(current.states.a!.values.count).toBe(4);
  expect(current.states.b!.values.count).toBe(2);
  expect(frame('a')).toBe(original);
  expect(messages.get(original)!.at(-1)).toMatchObject({ action: 'set', values: { count: 4 } });
  expect(messages.get(frame('b'))!.at(-1).values.count).toBe(2);
  await act(async () => current.change('a', 'count', 999));
  expect(current.states.a!.values.count).toBe(4);
});

test('reload rejects stale/foreign reports and reconciles overrides against changed author defaults', async () => {
  await render();
  const old = await connect('a');
  await report('a', old);
  await act(async () => current.change('a', 'count', 6));
  const next = await connect('a');
  expect(next).not.toBe(old);
  await report('a', old, { version: 1, controls: { count: { type: 'number', default: 1 } } });
  expect(current.states.a!.values.count).toBe(6);
  await report('a', next, initial, 'retired', frame('b').contentWindow!);
  expect(current.states.a!.values.count).toBe(6);
  await report(
    'a',
    next,
    { version: 1, controls: { count: { type: 'range', default: 3, min: 0, max: 4 } } },
    'fresh',
  );
  expect(current.states.a!.values.count).toBe(3);
  await report('a', next, initial, 'retired');
  expect(current.states.a!.values.count).toBe(3);
});

test('an expanded instance receives the same overrides and can disappear without losing them', async () => {
  await render();
  await report('a', await connect('a'));
  await act(async () => current.change('a', 'count', 4));
  await render({ expanded: true });
  await report('expanded', await connect('expanded'));
  expect(messages.get(frame('expanded'))!.at(-1)).toMatchObject({ values: { count: 4 } });
  await act(async () => current.change('a', 'count', 5));
  expect(messages.get(frame('a'))!.at(-1).values.count).toBe(5);
  expect(messages.get(frame('expanded'))!.at(-1).values.count).toBe(5);
  await render();
  expect(current.states.a!.values.count).toBe(5);
  await act(async () => current.reset('a'));
  expect(current.states.a!.values.count).toBe(2);
});

test('switching artifacts does not carry overrides into a same-named board', async () => {
  await render();
  const old = await connect('a');
  await report('a', old);
  await act(async () => current.change('a', 'count', 4));
  await render({ artifact: 'two' });
  expect(current.states.a).toBeUndefined();
  await report('a', old);
  expect(current.states.a).toBeUndefined();
  await report('a', await connect('a'));
  expect(current.states.a!.values.count).toBe(2);
});

test('the real parameter controls update state and reset while the anchor follows zoom at constant width', async () => {
  await render({ panel: true });
  await report('a', await connect('a'));
  const panel = host.querySelector<HTMLElement>('[aria-label="Parameters"]')!;
  expect(panel.style.left).toBe('317px');
  expect(panel.style.top).toBe('60px');
  expect(panel.style.width).toBe('352px');
  const slider = panel.querySelector('input[type="range"]')!;
  const numeric = panel.querySelector<HTMLInputElement>('input[type="text"]')!;
  expect(numeric.labels?.[0]?.textContent).toBe('Count');
  expect(document.getElementById(slider.getAttribute('aria-labelledby')!)?.textContent).toBe(
    'Count',
  );
  await act(async () =>
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
  );
  expect(current.states.a!.values.count).toBe(3);
  await act(async () =>
    [...panel.querySelectorAll('button')].find((b) => b.textContent?.includes('Reset'))!.click(),
  );
  expect(current.states.a!.values.count).toBe(2);
  await render({ panel: true, zoom: 2 });
  expect(panel.style.left).toBe('932px');
  expect(panel.style.top).toBe('90px');
  expect(panel.style.width).toBe('352px');
});

test('Esc closes the panel unless it ends an IME composition', async () => {
  await render({ panel: true });
  await report('a', await connect('a'));
  const slider = host.querySelector('[aria-label="Parameters"] input[type="range"]')!;
  await act(async () =>
    slider.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }),
    ),
  );
  await act(async () =>
    slider.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 229, bubbles: true }),
    ),
  );
  expect(closed).not.toHaveBeenCalled();
  await act(async () =>
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(closed).toHaveBeenCalledTimes(1);
});

test('resetting one parameter keeps the other preview overrides and the registered frame', async () => {
  await render({ panel: true });
  await report('a', await connect('a'), {
    version: 1,
    controls: {
      count: { type: 'range', label: 'Count', default: 2, min: 0, max: 8 },
      enabled: { type: 'boolean', label: 'Enabled', default: true },
    },
  });
  const original = frame('a');
  await act(async () => {
    current.change('a', 'count', 5);
    current.change('a', 'enabled', false);
  });
  const reset = host.querySelector<HTMLButtonElement>('button[aria-label="Reset Count"]');
  expect(reset).not.toBeNull();
  await act(async () => reset!.click());
  expect(current.states.a!.values).toEqual({ count: 2, enabled: false });
  expect(frame('a')).toBe(original);
  expect(messages.get(original)!.at(-1)).toMatchObject({
    action: 'set',
    values: { count: 2, enabled: false },
  });
});

test('parameter button icons are decorative or have an accessible alternative', async () => {
  await render({ panel: true });
  await report('a', await connect('a'));
  const unnamed = [...host.querySelectorAll('[aria-label="Parameters"] [role="img"]')].filter(
    (icon) =>
      !icon.closest('[aria-hidden="true"]') &&
      !icon.getAttribute('aria-label') &&
      !icon.getAttribute('aria-labelledby') &&
      !icon.getAttribute('title'),
  );
  expect(unnamed).toHaveLength(0);
});

test('opening parameters can reveal the entire panel while keeping its board anchor', () => {
  const board = { x: 0, y: 0, w: 1280, h: 800 };
  const view = { x: 80, y: 700, k: 1 };
  const offset = revealTweakPanel(board, view, { width: 1200, height: 900 });
  const anchor = tweakPanelAnchor(board, { ...view, x: view.x + offset.x, y: view.y + offset.y });
  expect(anchor).toEqual({ left: 836, top: 284 });
  expect(
    revealTweakPanel(
      { x: 10, y: 20, w: 400, h: 300 },
      { x: 100, y: 50, k: 0.5 },
      { width: 1200, height: 900 },
    ),
  ).toEqual({ x: 0, y: 0 });
});
