// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { BottomSheet } from '../src/viewer/components/BottomSheet';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let now = 0;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(844);
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  now = 0;
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function mount(snap: number, onSnap = vi.fn(), extra: object = {}) {
  if (root) act(() => root!.unmount());
  host?.remove();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      createElement(BottomSheet, {
        snaps: [78, 0.5],
        snap,
        onSnap,
        header: createElement('div', { 'data-title': '' }, '标题', createElement('button', { type: 'button', 'data-inner': '' }, '下一题')),
        children: createElement('p', null, '列表'),
        ...extra,
      }),
    ),
  );
  return onSnap;
}

const sheet = () => host!.querySelector<HTMLElement>('[data-sheet]')!;
const shown = () => 422 - Number(sheet().style.transform.match(/translateY\(([-\d.]+)px\)/)![1]);
const touch = (target: Element, type: string, y: number, at: number) => {
  now = at;
  return act(async () => target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 3, pointerType: 'touch', clientX: 100, clientY: y })));
};

test('the sheet follows the finger while it drags', async () => {
  await mount(78);
  const title = host!.querySelector('[data-title]')!;
  title.setPointerCapture = vi.fn();
  expect(shown()).toBe(78);
  await touch(title, 'pointerdown', 800, 0);
  await touch(title, 'pointermove', 740, 100);
  expect(shown()).toBe(138);
  expect(sheet().style.transition).toBe('none');
  await touch(title, 'pointermove', 700, 200);
  expect(shown()).toBe(178);
});

test('a slow release settles on the nearest height and a flick goes one further', async () => {
  const onSnap = await mount(78);
  const title = host!.querySelector('[data-title]')!;
  title.setPointerCapture = vi.fn();
  await touch(title, 'pointerdown', 800, 0);
  await touch(title, 'pointermove', 760, 200);
  await touch(title, 'pointermove', 700, 400);
  await touch(title, 'pointerup', 700, 420);
  expect(onSnap).toHaveBeenLastCalledWith(78);
  await touch(title, 'pointerdown', 800, 1000);
  await touch(title, 'pointermove', 780, 1010);
  await touch(title, 'pointermove', 760, 1020);
  await touch(title, 'pointerup', 760, 1025);
  expect(onSnap).toHaveBeenLastCalledWith(0.5);
});

test('past the top height the sheet resists instead of following one to one', async () => {
  await mount(0.5);
  const title = host!.querySelector('[data-title]')!;
  title.setPointerCapture = vi.fn();
  await touch(title, 'pointerdown', 400, 0);
  await touch(title, 'pointermove', 300, 100);
  expect(shown()).toBe(447);
});

test('a tap on the header toggles the height, a tap on a button inside it does not', async () => {
  const onSnap = await mount(78);
  const title = host!.querySelector('[data-title]')!;
  await touch(title, 'pointerdown', 800, 0);
  await touch(title, 'pointerup', 801, 50);
  await act(async () => (title as HTMLElement).click());
  expect(onSnap).toHaveBeenLastCalledWith(0.5);
  onSnap.mockClear();
  const inner = host!.querySelector<HTMLElement>('[data-inner]')!;
  await touch(inner, 'pointerdown', 800, 100);
  await touch(inner, 'pointerup', 800, 150);
  await act(async () => inner.click());
  expect(onSnap).not.toHaveBeenCalled();
});

test('the handle is a button that toggles the height', async () => {
  const onSnap = await mount(0.5);
  await act(async () => host!.querySelector<HTMLElement>('button[aria-label="Collapse"]')!.click());
  expect(onSnap).toHaveBeenLastCalledWith(78);
});

test('the scrim darkens with the sheet and only catches taps at the top height', async () => {
  const onScrim = vi.fn();
  await mount(78, vi.fn(), { onScrim });
  const scrim = () => host!.querySelector<HTMLElement>('[data-scrim]')!;
  expect(Number(scrim().style.opacity)).toBe(0);
  expect(scrim().style.pointerEvents).toBe('none');
  const title = host!.querySelector('[data-title]')!;
  title.setPointerCapture = vi.fn();
  await touch(title, 'pointerdown', 800, 0);
  await touch(title, 'pointermove', 628, 100);
  expect(Number(scrim().style.opacity)).toBeCloseTo(0.14, 2);
  await mount(0.5, vi.fn(), { onScrim });
  expect(Number(scrim().style.opacity)).toBeCloseTo(0.28, 2);
  await act(async () => scrim().click());
  expect(onScrim).toHaveBeenCalled();
});

test('a second finger tapping during a drag leaves the first finger in charge', async () => {
  const onSnap = await mount(78);
  const title = host!.querySelector('[data-title]')!;
  title.setPointerCapture = vi.fn();
  await touch(title, 'pointerdown', 800, 0);
  await touch(title, 'pointermove', 760, 20);
  await touch(title, 'pointermove', 650, 60);
  await act(async () => title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8, pointerType: 'touch', clientX: 200, clientY: 800 })));
  await act(async () => title.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8, pointerType: 'touch', clientX: 200, clientY: 800 })));
  await touch(title, 'pointerup', 650, 70);
  expect(onSnap).toHaveBeenCalled();
  expect(sheet().style.transition).not.toBe('none');
});

test('the first frame lands in place without sliding in', async () => {
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  await mount(78);
  expect(sheet().style.transition).toBe('none');
  await act(async () => queue.splice(0).forEach((cb) => cb(0)));
  expect(sheet().style.transition).toContain('transform');
});

test('grabbing a sheet mid-spring catches it where it is on screen', async () => {
  await mount(78);
  const title = host!.querySelector('[data-title]')!;
  title.setPointerCapture = vi.fn();
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ transform: 'matrix(1, 0, 0, 1, 0, 200)' } as CSSStyleDeclaration);
  await touch(title, 'pointerdown', 800, 0);
  expect(shown()).toBe(222);
  await touch(title, 'pointermove', 780, 50);
  expect(shown()).toBe(242);
});

test('a tap on a sheet caught mid-spring lets it finish where it was going', async () => {
  await mount(78);
  const title = host!.querySelector('[data-title]')!;
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({ transform: 'matrix(1, 0, 0, 1, 0, 200)' } as CSSStyleDeclaration);
  await touch(title, 'pointerdown', 800, 0);
  await touch(title, 'pointerup', 800, 40);
  expect(shown()).toBe(78);
  expect(sheet().style.transition).not.toBe('none');
});
