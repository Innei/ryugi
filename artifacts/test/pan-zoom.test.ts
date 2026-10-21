// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { COMMENT_CURSOR } from '../src/shared/inspector';
import { usePanZoom, type Tool } from '../src/viewer/hooks/usePanZoom';

let root: Root;
let host: HTMLDivElement;
let panZoom: ReturnType<typeof usePanZoom> & { panBy?: (x: number, y: number) => void; wheelAt?: (input: { deltaX: number; deltaY: number; x: number; y: number; zoom: boolean }) => void };

function Harness({ tool }: { tool: Tool }) {
  panZoom = usePanZoom(tool);
  const { viewportRef, view, cursor, handlers } = panZoom;
  return createElement(
    'div',
    { ref: viewportRef, ...handlers, style: { cursor } },
    createElement('output', null, JSON.stringify(view)),
    createElement('button', { 'data-chrome': '' }, 'Toolbar'),
    createElement('div', { 'data-chrome': 'board-label' }, createElement('span', { id: 'board-title' }, 'Board title')),
    createPortal(createElement('button', { id: 'menu-item' }, 'Zoom in'), document.body),
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button, clientX: 20, clientY: 10 }));
  });
}

test.each([
  { tool: 'hand' as const, button: 0, space: false },
  { tool: 'select' as const, button: 0, space: true },
  { tool: 'select' as const, button: 1, space: false },
])('portal menu interaction never pans the canvas ($tool, button $button, space $space)', ({ tool, button, space }) => {
  const viewport = render(tool, space);
  const before = host.querySelector('output')!.textContent;
  pointer(document.getElementById('menu-item')!, 'pointerdown', button);
  act(() => {
    viewport.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 40, clientY: 30 }));
  });
  expect(host.querySelector('output')!.textContent).toBe(before);
  expect(viewport.style.cursor).not.toBe('grabbing');
});

test.each([{ tool: 'hand' as const, button: 0 }, { tool: 'select' as const, button: 1 }])(
  'canvas drag still pans ($tool, button $button)',
  ({ tool, button }) => {
    const viewport = render(tool);
    pointer(viewport, 'pointerdown', button);
    act(() => {
      viewport.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: 40, clientY: 30 }));
    });
    expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ x: 20, y: 20, k: 0.5 });
    pointer(viewport, 'pointerup', button);
    expect(viewport.style.cursor).not.toBe('grabbing');
  },
);

test('toolbar interaction inside the viewport never starts dragging', () => {
  const viewport = render('hand');
  pointer(host.querySelector('button')!, 'pointerdown');
  expect(viewport.style.cursor).toBe('grab');
});

test('frame input pans and zooms around its translated cursor without resetting the view', () => {
  render('select');
  act(() => panZoom.panBy?.(40, 20));
  expect(JSON.parse(host.querySelector('output')!.textContent!)).toEqual({ x: 40, y: 20, k: 0.5 });
  act(() => panZoom.wheelAt?.({ deltaX: 0, deltaY: -Math.log(2) / 0.01, x: 100, y: 100, zoom: true }));
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
  const wheel = (target: Element, init: WheelEventInit) => act(() => {
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

function touch(target: Element, type: string, id: number, x: number, y: number) {
  act(() => {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y }));
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
