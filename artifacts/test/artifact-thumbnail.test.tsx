// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { ArtifactThumbnail } from '../src/viewer/components/ArtifactThumbnail';

let root: Root;
let host: HTMLDivElement;
const observers = new Map<Element, IntersectionObserverCallback>();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(element: Element) { observers.set(element, this.callback); }
    disconnect() {}
  });
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(element: Element) {
      this.callback([{ target: element, contentRect: { width: 300, height: 140 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    disconnect() {}
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  observers.clear();
  vi.unstubAllGlobals();
});

function visible(index: number, isIntersecting: boolean) {
  const element = host.querySelectorAll('.library-thumbnail')[index]!;
  act(() => observers.get(element)!([{ target: element, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));
}

const thumbnail = (id: string, version = 1) => createElement(ArtifactThumbnail, { key: id, title: id, src: `about:blank#${id}?v=${version}`, version });

test('scrolling away and back keeps the same loaded iframe', () => {
  act(() => root.render(thumbnail('a')));
  expect(host.querySelector('iframe')).toBeNull();
  visible(0, true);
  const frame = host.querySelector('iframe');
  expect(frame).not.toBeNull();
  visible(0, false);
  expect(host.querySelector('iframe')).toBe(frame);
  visible(0, true);
  expect(host.querySelector('iframe')).toBe(frame);
  act(() => root.render(thumbnail('a', 2)));
  expect(host.querySelector('iframe')).not.toBe(frame);
  expect(host.querySelector('iframe')?.getAttribute('src')).toBe('about:blank#a?v=2');
});

test('offscreen retention evicts the oldest preview while keeping visible frames', () => {
  act(() => root.render(Array.from({ length: 11 }, (_, index) => thumbnail(String(index)))));
  visible(0, true);
  const visibleFrame = host.querySelector('iframe');
  for (let index = 1; index <= 8; index++) {
    visible(index, true);
    visible(index, false);
  }
  const oldest = host.querySelectorAll('.library-thumbnail')[1]!;
  expect(oldest.querySelector('iframe')).not.toBeNull();
  visible(9, true);
  visible(9, false);
  expect(oldest.querySelector('iframe')).toBeNull();
  expect(host.querySelector('iframe')).toBe(visibleFrame);
  expect(host.querySelectorAll('iframe')).toHaveLength(9);
  visible(1, true);
  expect(oldest.querySelector('iframe')).not.toBeNull();
});
