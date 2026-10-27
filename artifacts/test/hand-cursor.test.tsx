// @vitest-environment happy-dom
import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { HandCursor } from '../src/viewer/components/HandCursor';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
}));

let root: Root;
let host: HTMLDivElement;

function Harness({ hand }: { hand: 'open' | 'pinch' | null }) {
  const viewport = useRef<HTMLDivElement>(null);
  return createElement(
    'div',
    { ref: viewport, id: 'viewport' },
    createElement('div', { 'data-chrome': '' }, createElement('button', { id: 'tool' }, 'Zoom')),
    createElement('iframe', { id: 'board' }),
    createElement(HandCursor, { viewport, hand }),
  );
}

function clock(reduced = false) {
  let now = 0,
    nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', () => ({ matches: reduced }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  return {
    frames,
    run(ms: number) {
      for (const end = now + ms; now < end;) {
        now = Math.min(end, now + 16);
        const pending = [...frames.values()];
        frames.clear();
        act(() => pending.forEach((callback) => callback(now)));
      }
    },
  };
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const render = (hand: 'open' | 'pinch' | null) =>
  act(() => root.render(createElement(Harness, { hand })));
const viewport = () => host.querySelector<HTMLDivElement>('#viewport')!;
const cursor = () => host.querySelector<HTMLElement>('[data-hand-cursor]');
const systemCursorHidden = () => viewport().hasAttribute('data-hand-drawn');
const move = (target: Element, x: number, y: number, pointerType = 'mouse') =>
  act(() => {
    target.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerType }),
    );
  });
const pinch = () => Number(cursor()!.getAttribute('data-pinch'));
const curl = () => Number(cursor()!.getAttribute('data-curl'));

test('follows the mouse with the palm centred on the pointer while panning', () => {
  clock();
  render('open');
  move(viewport(), 120, 80);
  expect(cursor()!.style.transform).toBe('translate(104px, 64px)');
  move(viewport(), 200, 40);
  expect(cursor()!.style.transform).toBe('translate(184px, 24px)');
});

test('hides the system cursor on the canvas and everything over it only while the hand is drawn', () => {
  clock();
  render('open');
  expect(systemCursorHidden()).toBe(false);
  move(viewport(), 120, 80);
  expect(systemCursorHidden()).toBe(true);
  expect(
    [...document.querySelectorAll('style')].some((style) =>
      /\[data-hand-drawn\][^*{]*\*[^{]*\{[^}]*cursor:\s*none\s*!important/.test(
        style.textContent ?? '',
      ),
    ),
  ).toBe(true);
  render(null);
  expect(systemCursorHidden()).toBe(false);
});

test('waits for the pointer before drawing, and keeps the place it last saw', () => {
  clock();
  render(null);
  move(viewport(), 50, 60);
  expect(cursor()).toBeNull();
  render('open');
  expect(cursor()!.style.transform).toBe('translate(34px, 44px)');
});

test('gives the pointer back over canvas chrome, to touch, and when the pointer leaves', () => {
  clock();
  render('open');
  move(viewport(), 120, 80);
  move(host.querySelector('#tool')!, 10, 10);
  expect(cursor()).toBeNull();
  expect(systemCursorHidden()).toBe(false);
  move(viewport(), 120, 80);
  expect(cursor()).not.toBeNull();
  move(viewport(), 120, 80, 'touch');
  expect(cursor()).toBeNull();
  move(viewport(), 120, 80);
  act(() => {
    viewport().dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
  });
  expect(cursor()).toBeNull();
  expect(systemCursorHidden()).toBe(false);
});

test('gives the pointer back once it crosses into a board frame, whose moves the canvas never hears', () => {
  clock();
  render('open');
  move(viewport(), 120, 80);
  act(() => {
    host
      .querySelector('#board')!
      .dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
  });
  expect(cursor()).toBeNull();
  expect(systemCursorHidden()).toBe(false);
  move(viewport(), 300, 200);
  expect(cursor()!.style.transform).toBe('translate(284px, 184px)');
});

test('disappears when panning ends', () => {
  clock();
  render('open');
  move(viewport(), 120, 80);
  render(null);
  expect(cursor()).toBeNull();
});

test('pinches on a spring, the other fingers following a beat later, and opens again on release', () => {
  const time = clock();
  render('open');
  move(viewport(), 120, 80);
  render('pinch');
  time.run(16);
  expect(pinch()).toBeGreaterThan(0);
  expect(pinch()).toBeLessThan(1);
  expect(curl()).toBe(0);
  let peak = 0;
  for (let i = 0; i < 60; i++) {
    time.run(16);
    peak = Math.max(peak, pinch());
  }
  expect(peak).toBeGreaterThan(1);
  expect(pinch()).toBe(1);
  expect(curl()).toBe(1);
  expect(time.frames.size).toBe(0);
  render('open');
  time.run(1000);
  expect(pinch()).toBe(0);
  expect(curl()).toBe(0);
  expect(time.frames.size).toBe(0);
});

test('with reduced motion the hand snaps between open and pinched', () => {
  const time = clock(true);
  render('open');
  move(viewport(), 120, 80);
  render('pinch');
  expect(pinch()).toBe(1);
  expect(curl()).toBe(1);
  expect(time.frames.size).toBe(0);
});
