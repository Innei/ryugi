// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PhoneBoard } from '../src/viewer/components/PhoneBoard';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

let root: Root | undefined;
let host: HTMLDivElement | undefined;
let now = 0;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  now = 0;
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const board = (title: string, h = 844) => ({
  file: `${title}.html`,
  page: 'p',
  x: 0,
  y: 0,
  w: 390,
  h,
  title,
});

async function open(id: string, siblings: string[], extra: object = {}) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const onClose = vi.fn();
  const onOpen = vi.fn();
  await act(async () =>
    root!.render(
      createElement(PhoneBoard, {
        id,
        board: board(`标题 ${id}`),
        src: 'about:blank',
        siblings,
        onOpen,
        onClose,
        ...extra,
      }),
    ),
  );
  return { onClose, onOpen };
}

const body = () => host!.querySelector<HTMLElement>('[data-board-body]')!;
const stage = () => host!.querySelector<HTMLElement>('[data-board-stage]')!;
const finger = async (type: string, x: number, y: number, at: number) => {
  now = at;
  body().setPointerCapture = vi.fn();
  await act(async () =>
    body().dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: 4,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      }),
    ),
  );
};
const scaleOf = (el: HTMLElement) =>
  Number(el.style.transform.match(/scale\(([-\d.]+)\)/)?.[1] ?? 1);

test('the header leads with a back button, the title, the board id and the position', async () => {
  await open('q2-a', ['q2-a', 'q2-b']);
  const head = host!.querySelector('[data-phone-board] header')!;
  expect(head.querySelector('button[aria-label="Back to canvas"]')).not.toBeNull();
  expect(head.textContent).toContain('标题 q2-a');
  expect(head.textContent).toContain('q2-a');
  expect(head.textContent).toContain('1 / 2');
});

test('the footer marks the current board with a dot and steps with icon buttons', async () => {
  const { onOpen } = await open('q2-b', ['q2-a', 'q2-b', 'q2-c']);
  expect(
    [...host!.querySelectorAll('[data-dot]')].map((dot) => dot.getAttribute('data-dot')),
  ).toEqual(['', 'current', '']);
  await act(async () =>
    host!.querySelector<HTMLElement>('button[aria-label="Previous board"]')!.click(),
  );
  await vi.waitFor(() => expect(onOpen).toHaveBeenCalledWith('q2-a'));
});

test('opening from a tile on the canvas grows the board out of that tile', async () => {
  const animate = vi.spyOn(HTMLElement.prototype, 'animate');
  await open('p1', ['p1'], { origin: { x: 20, y: 300, w: 104, h: 225 } });
  const grow = animate.mock.calls.find(([frames]) => JSON.stringify(frames).includes('scale'));
  expect(grow).toBeDefined();
  expect(JSON.stringify(grow![0])).toContain('scale(0.26');
});

test('a board dragged down follows the finger, shrinks, and closes past the threshold', async () => {
  const { onClose } = await open('p1', ['p1']);
  await finger('pointerdown', 195, 200, 0);
  await finger('pointermove', 195, 220, 50);
  await finger('pointermove', 195, 400, 300);
  expect(scaleOf(stage())).toBeLessThan(1);
  expect(stage().style.transform).toContain('translate(');
  await finger('pointerup', 195, 400, 320);
  await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
});

test('a short slow drag down springs back and keeps the board open', async () => {
  const { onClose } = await open('p1', ['p1']);
  await finger('pointerdown', 195, 200, 0);
  await finger('pointermove', 195, 230, 200);
  await finger('pointermove', 195, 260, 400);
  await finger('pointerup', 195, 260, 600);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(onClose).not.toHaveBeenCalled();
  expect(scaleOf(stage())).toBe(1);
});

test('a swipe left follows the finger and opens the next board in the group', async () => {
  const { onOpen } = await open('p1', ['p1', 'p2']);
  await finger('pointerdown', 300, 300, 0);
  await finger('pointermove', 280, 302, 20);
  await finger('pointermove', 140, 305, 120);
  expect(stage().style.transform).toContain('translateX(-160px)');
  await finger('pointerup', 140, 305, 130);
  await vi.waitFor(() => expect(onOpen).toHaveBeenCalledWith('p2'));
});

test('past the last board a swipe resists and opens nothing', async () => {
  const { onOpen } = await open('p2', ['p1', 'p2']);
  await finger('pointerdown', 300, 300, 0);
  await finger('pointermove', 280, 302, 20);
  await finger('pointermove', 140, 305, 120);
  expect(stage().style.transform).toContain('translateX(-40px)');
  await finger('pointerup', 140, 305, 130);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(onOpen).not.toHaveBeenCalled();
});

test('a tall board scrolled down pans back up instead of closing', async () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const onClose = vi.fn();
  await act(async () =>
    root!.render(
      createElement(PhoneBoard, {
        id: 'tall',
        board: board('长页', 2000),
        src: 'about:blank',
        siblings: ['tall'],
        onOpen: vi.fn(),
        onClose,
      }),
    ),
  );
  const world = () =>
    Number(
      host!
        .querySelector<HTMLElement>('iframe')!
        .parentElement!.style.transform.match(/translate\([-\d.]+px, ([-\d.]+)px\)/)![1],
    );
  await finger('pointerdown', 195, 500, 0);
  await finger('pointermove', 195, 300, 100);
  await finger('pointerup', 195, 300, 200);
  expect(world()).toBeLessThan(0);
  await finger('pointerdown', 195, 300, 1000);
  await finger('pointermove', 195, 400, 1100);
  await finger('pointerup', 195, 400, 1200);
  expect(scaleOf(stage())).toBe(1);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(onClose).not.toHaveBeenCalled();
});

const fire = async (type: string, id: number, x: number, y: number, at: number) => {
  now = at;
  body().setPointerCapture = vi.fn();
  await act(async () =>
    body().dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: id,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      }),
    ),
  );
};

test('a vertical pinch zooms the board and never closes it', async () => {
  const { onClose } = await open('p1', ['p1']);
  await fire('pointerdown', 1, 195, 400, 0);
  await fire('pointerdown', 2, 195, 300, 5);
  for (let i = 1; i <= 10; i++) {
    await fire('pointermove', 1, 195, 400 + i * 15, 10 + i * 16);
    await fire('pointermove', 2, 195, 300 - i * 15, 12 + i * 16);
  }
  expect(scaleOf(stage())).toBe(1);
  const world = host!.querySelector<HTMLElement>('iframe')!.parentElement!;
  expect(Number(world.style.transform.match(/scale\(([-\d.]+)\)/)![1])).toBeGreaterThan(1);
  await fire('pointerup', 1, 195, 550, 180);
  await fire('pointerup', 2, 195, 150, 182);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(onClose).not.toHaveBeenCalled();
});

test('a horizontal pinch on a board with siblings zooms instead of paging', async () => {
  const { onOpen } = await open('p1', ['p1', 'p2']);
  await fire('pointerdown', 1, 150, 400, 0);
  await fire('pointerdown', 2, 240, 400, 5);
  for (let i = 1; i <= 10; i++) {
    await fire('pointermove', 1, 150 - i * 14, 400, 10 + i * 16);
    await fire('pointermove', 2, 240 + i * 14, 400, 12 + i * 16);
  }
  await fire('pointerup', 1, 10, 400, 180);
  await fire('pointerup', 2, 380, 400, 182);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(onOpen).not.toHaveBeenCalled();
});

test('a finger landing while the board is still growing takes over at once', async () => {
  await open('p1', ['p1'], { origin: { x: 20, y: 300, w: 104, h: 225 } });
  expect(stage().getAnimations().length).toBeGreaterThan(0);
  await finger('pointerdown', 195, 200, 0);
  expect(stage().getAnimations()).toHaveLength(0);
});

test('pulling down then flicking back up cancels the close', async () => {
  const { onClose } = await open('p1', ['p1']);
  await finger('pointerdown', 195, 200, 0);
  await finger('pointermove', 195, 300, 200);
  await finger('pointermove', 195, 350, 400);
  await finger('pointermove', 195, 330, 410);
  await finger('pointerup', 195, 330, 415);
  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(onClose).not.toHaveBeenCalled();
});

test('swiping past the threshold then flicking back cancels the page turn', async () => {
  const { onOpen } = await open('p1', ['p1', 'p2']);
  await finger('pointerdown', 300, 300, 0);
  await finger('pointermove', 250, 300, 200);
  await finger('pointermove', 170, 300, 400);
  await finger('pointermove', 180, 300, 410);
  await finger('pointerup', 182, 300, 415);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(onOpen).not.toHaveBeenCalled();
});
