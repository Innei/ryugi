// @vitest-environment happy-dom
import { $createHeadingNode, HeadingNode } from '@lexical/rich-text';
import { $createTextNode, $getRoot, createEditor } from 'lexical';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { DocumentToc } from '../src/viewer/document/DocumentToc';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  window.scrollTo(0, 0);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  const host = document.createElement('div');
  const article = document.createElement('article');
  document.body.append(host, article);
  const editor = createEditor({
    nodes: [HeadingNode],
    onError: (error) => {
      throw error;
    },
  });
  editor.setRootElement(article);
  editor.update(
    () =>
      $getRoot().append(
        ...['First', 'Middle', 'Last'].map((text) =>
          $createHeadingNode('h2').append($createTextNode(text)),
        ),
      ),
    { discrete: true },
  );
  const headings = [...article.querySelectorAll('h2')];
  headings.forEach((heading, index) =>
    vi
      .spyOn(heading, 'getBoundingClientRect')
      .mockImplementation(() => new DOMRect(0, [100, 600, 1200][index]! - window.scrollY, 700, 28)),
  );
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: 5000,
  });
  root = createRoot(host);
  await act(async () => root!.render(createElement(DocumentToc, { editor })));
  const buttons = [...host.querySelectorAll('button')];
  const list = buttons[0]!.parentElement!;
  let height = 200;
  Object.defineProperty(list, 'clientHeight', { get: () => height });
  vi.spyOn(list, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 100, 220, height),
  );
  buttons.forEach((button, index) =>
    vi
      .spyOn(button, 'getBoundingClientRect')
      .mockImplementation(() => new DOMRect(0, 100 + index * 140 - list.scrollTop, 220, 28)),
  );
  const scroll = async (top: number) =>
    act(async () => {
      window.scrollTo(0, top);
      window.dispatchEvent(new Event('scroll'));
    });
  const expectVisible = (button: HTMLElement) => {
    expect(button.getBoundingClientRect().top).toBeGreaterThanOrEqual(100);
    expect(button.getBoundingClientRect().bottom).toBeLessThanOrEqual(100 + height);
  };
  return {
    host,
    list,
    buttons,
    scroll,
    expectVisible,
    resize: (next: number) => {
      height = next;
    },
  };
}

test('scrolling the document keeps the active TOC entry visible in both directions without moving the article', async () => {
  const { host, list, buttons, scroll, expectVisible } = await mount();
  await scroll(1100);
  expect(host.querySelector('[aria-current="location"]')?.textContent).toBe('Last');
  expect(list.scrollTop).toBeGreaterThan(0);
  expectVisible(buttons[2]!);
  expect(window.scrollY).toBe(1100);
  await scroll(0);
  expect(host.querySelector('[aria-current="location"]')?.textContent).toBe('First');
  expectVisible(buttons[0]!);
  expect(window.scrollY).toBe(0);
});

test('shrinking the viewport brings the same active TOC entry back into view', async () => {
  const { buttons, scroll, resize, expectVisible } = await mount();
  await scroll(1100);
  resize(50);
  await act(async () => window.dispatchEvent(new Event('resize')));
  expectVisible(buttons[2]!);
  expect(window.scrollY).toBe(1100);
});

test('continuing to read the same section restores an active entry hidden by manual TOC scrolling', async () => {
  const { buttons, list, scroll, expectVisible } = await mount();
  await scroll(1100);
  list.scrollTop = 0;
  await scroll(1150);
  expectVisible(buttons[2]!);
  expect(window.scrollY).toBe(1150);
});

test('a TOC click animates toward the heading and manual scrolling interrupts it', async () => {
  const { buttons } = await mount();
  await act(async () => buttons[2]!.click());
  await vi.waitFor(() => expect(window.scrollY).toBeGreaterThan(0));
  expect(window.scrollY).toBeLessThan(1100);
  window.dispatchEvent(new WheelEvent('wheel'));
  const stoppedAt = window.scrollY;
  await new Promise((resolve) => setTimeout(resolve, 80));
  expect(window.scrollY).toBe(stoppedAt);
});

test('a second TOC click replaces the running spring and lands below the header', async () => {
  const { buttons } = await mount();
  await act(async () => buttons[2]!.click());
  await vi.waitFor(() => expect(window.scrollY).toBeGreaterThan(0));
  await act(async () => buttons[1]!.click());
  await vi.waitFor(() => expect(window.scrollY).toBe(500), { timeout: 4000 });
});

test('reduced motion jumps to the heading without an animation', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const { buttons } = await mount();
  await act(async () => buttons[2]!.click());
  expect(window.scrollY).toBe(1100);
});
