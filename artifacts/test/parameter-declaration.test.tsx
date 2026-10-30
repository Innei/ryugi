// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion, MotionGlobalConfig } from 'motion/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { readTweakSchema, reconcileTweakValues } from '../src/shared/tweaks';
import { usePanZoom } from '../src/viewer/hooks/usePanZoom';
import { TweaksPanel } from '../src/viewer/tweaks/TweaksPanel';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

const schema = readTweakSchema({
  version: 1,
  controls: { count: { type: 'range', label: 'Count', default: 2, min: 0, max: 8 } },
}).schema!;
const capture = vi.fn();
let host: HTMLDivElement;
let root: Root;
function Harness() {
  const { viewportRef, handlers } = usePanZoom('hand');
  return (
    <div data-viewport ref={viewportRef} {...handlers}>
      <TweaksPanel
        boardId="main"
        state={{ schema, error: null, values: reconcileTweakValues(schema) }}
        title="Main"
        onChange={() => {}}
        onClose={() => {}}
        onReset={() => {}}
      />
    </div>
  );
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  MotionGlobalConfig.skipAnimations = true;
  capture.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <ConfigProvider enableCustomFonts={false} motion={motion}>
        <Harness />
      </ConfigProvider>,
    ),
  );
  host.querySelector<HTMLElement>('[data-viewport]')!.setPointerCapture = capture;
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function open() {
  // Supply the browser primitive when running the original native-dialog implementation.
  const native = host.querySelector('dialog');
  if (native && typeof native.showModal !== 'function')
    native.showModal = () => (native.open = true);
  const button = [...host.querySelectorAll('button')].find((element) =>
    element.textContent?.includes('View declaration'),
  )!;
  button.focus();
  await act(async () => button.click());
  return button;
}

test('closing the declaration does not capture its pointer for canvas panning', async () => {
  const trigger = await open();
  const close = document.querySelector<HTMLButtonElement>('[aria-label="Close declaration"]')!;
  expect(close).not.toBeNull();
  await act(async () =>
    close.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
      }),
    ),
  );
  expect(capture).not.toHaveBeenCalled();
  await act(async () => close.click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(host.querySelector('[aria-label="Parameters"]')).not.toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test('the declaration can show only the current values instead of a second long schema', async () => {
  await open();
  const values = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Current values',
  );
  expect(values).toBeDefined();
  await act(async () => values!.click());
  const content = document.querySelector('pre[aria-label="Current values"]');
  expect(content).not.toBeNull();
  expect(JSON.parse(content!.textContent!)).toEqual({ count: 2 });
});
