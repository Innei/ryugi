// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { COMMENT_CURSOR } from '../src/shared/inspector';
import { type Tool, usePanZoom } from '../src/viewer/hooks/usePanZoom';
import { fitView } from '../src/viewer/lib/view';

let root: Root;
let host: HTMLDivElement;
let panZoom: ReturnType<typeof usePanZoom> & {
  panBy?: (x: number, y: number) => void;
  wheelAt?: (input: {
    deltaX: number;
    deltaY: number;
    x: number;
    y: number;
    zoom: boolean;
  }) => void;
};

function Harness({ tool }: { tool: Tool }) {
  panZoom = usePanZoom(tool);
  const { viewportRef, view, cursor, handlers } = panZoom;
  return createElement(
    'div',
    { ref: viewportRef, ...handlers, style: { cursor } },
    createElement('output', null, JSON.stringify(view)),
    createElement('button', { 'data-chrome': '' }, 'Toolbar'),
    createElement(
      'div',
      { 'data-chrome': 'board-label' },
      createElement('span', { id: 'board-title' }, 'Board title'),
    ),
    createElement(
      'div',
      { 'data-chrome': 'group-label' },
      createElement('button', { id: 'verdict' }, '通过'),
    ),
    createElement(
      'div',
      { 'data-chrome': 'video-controls' },
      createElement('span', { id: 'clock' }, '0:00'),
    ),
    createElement('div', { 'data-chrome': 'reject' }, createElement('textarea', { id: 'reason' })),
    createElement(
      'aside',
      { 'data-chrome': 'parameters' },
      createElement('label', { id: 'control' }, 'Accent'),
    ),
    createElement(
      'div',
      { 'data-chrome': 'comments' },
      createElement(
        'div',
        { id: 'popover', style: { overflowY: 'auto' } },
        createElement('p', { id: 'reply' }, 'Reply'),
      ),
    ),
    createElement(
      'div',
      { 'data-chrome': '' },
      createElement(
        'aside',
        { 'data-chrome': 'parameters' },
        createElement('label', { id: 'expanded-control' }, 'Accent'),
      ),
    ),
    createPortal(createElement('button', { id: 'menu-item' }, 'Zoom in'), document.body),
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(performance.now());
    return 0;
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(tool: Tool, space = false) {
  act(() => root.render(createElement(Harness, { tool })));
  if (space) act(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })));
  const viewport = host.firstElementChild as HTMLDivElement;
  // Pointer capture is a browser API absent from happy-dom.
  viewport.setPointerCapture = vi.fn();
  return viewport;
}

function pointer(target: Element, type: string, button = 0) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: 1, button, clientX: 20, clientY: 10 }),
    );
  });
}

test.each([
  { tool: 'hand' as const, button: 0, space: false },
  { tool: 'select' as const, button: 0, space: true },
  { tool: 'select' as const, button: 1, space: false },
])(
  'portal menu interaction never pans the canvas ($tool, button $button, space $space)',
  ({ tool, button, space }) => {
    const viewport = render(tool, space);
    const before = host.querySelector('output')!.textContent;
    pointer(document.getElementById('menu-item')!, 'pointerdown', button);
    act(() => {
      viewport.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 40, clientY: 30 }),
      );
    });
    expect(host.querySelector('output')!.textContent).toBe(before);
    expect(viewport.style.cursor).not.toBe('grabbing');
  },
);

test.each([
  { tool: 'hand' as const, button: 0 },
  { tool: 'select' as const, button: 1 },
])('canvas drag still pans ($tool, button $button)', ({ tool, button }) => {
  const viewport = render(tool);
  pointer(viewport, 'pointerdown', button);
  act(() => {
    viewport.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 40, clientY: 30 }),
    );
  });
  expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ x: 20, y: 20, k: 0.5 });
  pointer(viewport, 'pointerup', button);
  expect(viewport.style.cursor).not.toBe('grabbing');
});

test('toolbar interaction inside the viewport never starts dragging', () => {
  const viewport = render('hand');
  pointer(host.querySelector('button')!, 'pointerdown');
  expect(viewport.style.cursor).toBe('grab');
});

test('frame input pans and zooms around its translated cursor without resetting the view', () => {
  render('select');
  act(() => panZoom.panBy?.(40, 20));
  expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ x: 40, y: 20, k: 0.5 });
  act(() =>
    panZoom.wheelAt?.({ deltaX: 0, deltaY: -Math.log(2) / 0.01, x: 100, y: 100, zoom: true }),
  );
  expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ x: -20, y: -60, k: 1 });
});

test('Space on toolbar controls keeps its native keyboard action instead of starting canvas pan', () => {
  const viewport = render('select');
  let event: KeyboardEvent;
  act(() => {
    event = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    host.querySelector('button')!.dispatchEvent(event);
  });
  expect(event!.defaultPrevented).toBe(false);
  expect(viewport.style.cursor).toBe('default');
});

test('trackpad gestures over a board title pan and pinch the canvas, while toolbar scrolling stays local', () => {
  render('select');
  const wheel = (target: Element, init: WheelEventInit) =>
    act(() => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
      // happy-dom's WheelEvent omits modifier keys.
      Object.defineProperty(event, 'ctrlKey', { value: init.ctrlKey ?? false });
      target.dispatchEvent(event);
    });
  wheel(host.querySelector('button')!, { deltaY: 40 });
  expect(panZoom.view).toEqual({ x: 0, y: 0, k: 0.5 });
  wheel(host.querySelector('#board-title')!, { deltaX: 12, deltaY: 40 });
  expect(panZoom.view).toEqual({ x: -12, y: -40, k: 0.5 });
  wheel(host.querySelector('#board-title')!, { deltaY: -Math.log(2) / 0.01, ctrlKey: true });
  expect(panZoom.view.k).toBe(1);
});

function wheelAt(target: Element, init: WheelEventInit & { deltaMode?: number }) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  // happy-dom's WheelEvent omits modifier keys and deltaMode.
  Object.defineProperty(event, 'ctrlKey', { value: init.ctrlKey ?? false });
  Object.defineProperty(event, 'deltaMode', { value: init.deltaMode ?? 0 });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

test.each(['#verdict', '#clock', '#reason', '#control', '#reply'])(
  'trackpad gestures over canvas chrome %s pan the canvas',
  (selector) => {
    render('select');
    const event = wheelAt(host.querySelector(selector)!, { deltaX: 12, deltaY: 40 });
    expect(event.defaultPrevented).toBe(true);
    expect(panZoom.view).toEqual({ x: -12, y: -40, k: 0.5 });
  },
);

test('a pinch over canvas chrome zooms the canvas', () => {
  render('select');
  wheelAt(host.querySelector('#verdict')!, { deltaY: -Math.log(2) / 0.01, ctrlKey: true });
  expect(panZoom.view.k).toBe(1);
});

test('canvas chrome that overflows scrolls itself instead of panning', () => {
  render('select');
  const popover = host.querySelector('#popover')!;
  Object.defineProperty(popover, 'scrollHeight', { value: 800 });
  Object.defineProperty(popover, 'clientHeight', { value: 400 });
  const event = wheelAt(host.querySelector('#reply')!, { deltaY: 40 });
  expect(event.defaultPrevented).toBe(false);
  expect(panZoom.view).toEqual({ x: 0, y: 0, k: 0.5 });
});

test('a panel inside fixed chrome keeps its wheel even though it can sit on the canvas', () => {
  render('select');
  wheelAt(host.querySelector('#expanded-control')!, { deltaY: 40 });
  expect(panZoom.view).toEqual({ x: 0, y: 0, k: 0.5 });
});

test('a pinch over fixed chrome or a side panel never zooms the browser page', () => {
  render('select');
  const side = document.createElement('aside');
  document.body.append(side);
  expect(
    wheelAt(host.querySelector('button')!, { deltaY: 10, ctrlKey: true }).defaultPrevented,
  ).toBe(true);
  expect(wheelAt(side, { deltaY: 10, ctrlKey: true }).defaultPrevented).toBe(true);
  expect(wheelAt(side, { deltaY: 10 }).defaultPrevented).toBe(false);
  expect(panZoom.view).toEqual({ x: 0, y: 0, k: 0.5 });
  side.remove();
});

test('line-based wheel deltas pan by pixels', () => {
  render('select');
  wheelAt(host.querySelector('#board-title')!, { deltaY: 3, deltaMode: 1 });
  expect(panZoom.view).toEqual({ x: 0, y: -48, k: 0.5 });
});

function touch(target: Element, type: string, id: number, x: number, y: number) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerId: id,
        pointerType: 'touch',
        button: 0,
        clientX: x,
        clientY: y,
      }),
    );
  });
}

test('one finger pans the canvas whatever the tool', () => {
  const viewport = render('select');
  touch(viewport, 'pointerdown', 7, 100, 100);
  touch(viewport, 'pointermove', 7, 130, 80);
  touch(viewport, 'pointerup', 7, 130, 80);
  expect(panZoom.view).toEqual({ x: 30, y: -20, k: 0.5 });
});

test('two fingers pinch around their midpoint and pan with it', () => {
  const viewport = render('select');
  touch(viewport, 'pointerdown', 1, 100, 100);
  touch(viewport, 'pointerdown', 2, 200, 100);
  touch(viewport, 'pointermove', 2, 300, 100);
  expect(panZoom.view).toEqual({ x: -100, y: -100, k: 1 });
  touch(viewport, 'pointerup', 2, 300, 100);
  touch(viewport, 'pointermove', 1, 110, 100);
  expect(panZoom.view).toEqual({ x: -90, y: -100, k: 1 });
});

test('a finger on the toolbar never moves the canvas', () => {
  const viewport = render('select');
  touch(host.querySelector('button')!, 'pointerdown', 3, 10, 10);
  touch(viewport, 'pointermove', 3, 60, 60);
  expect(panZoom.view).toEqual({ x: 0, y: 0, k: 0.5 });
});

test('a finger that started on the toolbar never moves the canvas while another finger is down', () => {
  const viewport = render('select');
  touch(viewport, 'pointerdown', 1, 100, 100);
  touch(host.querySelector('button')!, 'pointerdown', 2, 300, 300);
  touch(viewport, 'pointermove', 2, 310, 310);
  expect(panZoom.view).toEqual({ x: 0, y: 0, k: 0.5 });
});

test('the comment tool shows the bubble cursor and does not pan', () => {
  const viewport = render('comment');
  expect(panZoom.cursor).toBe(COMMENT_CURSOR);
  expect(panZoom.panning).toBe(false);
  expect(viewport).toBeTruthy();
});

test('holding space still pans from the comment tool', () => {
  render('comment', true);
  expect(panZoom.cursor).toBe('grab');
});

test('a pan tool offers an open hand that pinches while dragging', () => {
  const viewport = render('select', true);
  expect(panZoom.hand).toBe('open');
  pointer(viewport, 'pointerdown');
  expect(panZoom.hand).toBe('pinch');
  pointer(viewport, 'pointerup');
  expect(panZoom.hand).toBe('open');
});

test('a middle-button drag pinches even without a pan tool, and other tools show no hand', () => {
  const viewport = render('comment');
  expect(panZoom.hand).toBeNull();
  pointer(viewport, 'pointerdown', 1);
  expect(panZoom.hand).toBe('pinch');
  pointer(viewport, 'pointerup', 1);
  expect(panZoom.hand).toBeNull();
});

function frames() {
  const queue: FrameRequestCallback[] = [];
  let now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
  vi.stubGlobal('cancelAnimationFrame', () => queue.splice(0));
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  return (ms: number) =>
    act(() => {
      now += ms;
      queue.splice(0).forEach((cb) => cb(now));
    });
}
const shown = () =>
  JSON.parse(host.querySelector('output')!.textContent!) as { x: number; y: number; k: number };
const sized = () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
};
const target = { minX: 0, minY: 0, maxX: 800, maxY: 800 };
const flat = { top: 0, right: 0, bottom: 0, left: 0 };
const fitted = () => fitView(target, { width: 400, height: 400 }, flat);

test('an animated fit eases the view over several frames and lands on the fitted view', () => {
  sized();
  const step = frames();
  render('hand');
  act(() => panZoom.place({ x: 100, y: 100, k: 2 }));
  act(() => panZoom.fit(target, flat, { animate: true }));
  expect(shown()).toEqual({ x: 100, y: 100, k: 2 });
  step(100);
  const mid = shown();
  expect(mid.k).toBeLessThan(2);
  expect(mid.k).toBeGreaterThan(fitted().k);
  expect(mid.x).toBeLessThan(100);
  step(400);
  expect(shown()).toEqual(fitted());
  vi.restoreAllMocks();
});

test('with reduced motion an animated fit jumps straight to the fitted view', () => {
  sized();
  frames();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  render('hand');
  act(() => panZoom.place({ x: 100, y: 100, k: 2 }));
  act(() => panZoom.fit(target, flat, { animate: true }));
  expect(shown()).toEqual(fitted());
  vi.restoreAllMocks();
});

test('a finger landing during an animated fit stops it where it is', () => {
  sized();
  const step = frames();
  render('hand');
  act(() => panZoom.place({ x: 100, y: 100, k: 2 }));
  act(() => panZoom.fit(target, flat, { animate: true }));
  step(100);
  const caught = shown();
  const el = host.firstElementChild as HTMLElement;
  el.setPointerCapture = vi.fn();
  act(() =>
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 1,
        pointerType: 'touch',
        clientX: 10,
        clientY: 10,
      }),
    ),
  );
  step(400);
  expect(shown()).toEqual(caught);
  vi.restoreAllMocks();
});

test('every zoom change marks the canvas as scaling, until 150 ms after the last step', () => {
  vi.useFakeTimers();
  try {
    render('select');
    act(() => panZoom.wheelAt?.({ deltaX: 0, deltaY: -10, x: 100, y: 100, zoom: true }));
    expect(panZoom.scaling).toBe(true);
    act(() => vi.advanceTimersByTime(149));
    expect(panZoom.scaling).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(panZoom.scaling).toBe(false);
    act(() => panZoom.zoomBy(1.2));
    expect(panZoom.scaling).toBe(true);
    act(() => vi.advanceTimersByTime(150));
    expect(panZoom.scaling).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('a slower step during a continuous zoom keeps the canvas scaling', () => {
  vi.useFakeTimers();
  try {
    render('select');
    act(() => panZoom.zoomBy(1.1));
    act(() => vi.advanceTimersByTime(16));
    act(() => panZoom.zoomBy(1.1));
    expect(panZoom.scaling).toBe(true);
    act(() => vi.advanceTimersByTime(130));
    act(() => panZoom.zoomBy(1.1));
    act(() => vi.advanceTimersByTime(140));
    expect(panZoom.scaling).toBe(true);
    act(() => vi.advanceTimersByTime(10));
    expect(panZoom.scaling).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('panning by wheel, drag or frame input marks the canvas as gesturing until it settles', () => {
  vi.useFakeTimers();
  try {
    const viewport = render('hand');
    act(() => panZoom.wheelAt?.({ deltaX: 30, deltaY: 40, x: 100, y: 100, zoom: false }));
    act(() => panZoom.panBy?.(10, 10));
    pointer(viewport, 'pointerdown');
    act(() => {
      viewport.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 60, clientY: 50 }),
      );
    });
    expect(panZoom.gesturing).toBe(true);
    act(() => vi.advanceTimersByTime(150));
    expect(panZoom.gesturing).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('size follows the viewport element as it resizes', () => {
  const observers: { callback: () => void; target?: Element }[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      entry: { callback: () => void; target?: Element };
      constructor(callback: () => void) {
        this.entry = { callback };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {}
    },
  );
  const viewport = render('hand');
  Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 1280 });
  Object.defineProperty(viewport, 'clientHeight', { configurable: true, value: 720 });
  act(() => observers.find((observer) => observer.target === viewport)!.callback());
  expect(panZoom.size).toEqual({ width: 1280, height: 720 });
});
