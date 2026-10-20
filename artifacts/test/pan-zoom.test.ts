// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
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
