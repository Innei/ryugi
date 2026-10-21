// @vitest-environment happy-dom
import { ConfigProvider, ModalHost } from '@lobehub/ui';
import { motion, MotionGlobalConfig } from 'motion/react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { MermaidPreview } from '../src/viewer/document/MermaidPreview';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

const source = 'flowchart LR\n  A[Agent 回合结束] --> B{auto-publish 开启?}';

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  MotionGlobalConfig.skipAnimations = true;
});
afterEach(async () => {
  const close = document.querySelector<HTMLElement>('[role="dialog"] [aria-label="关闭"]');
  if (close) await act(async () => close.click());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function renderDocument(heading: string | null) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const page = createElement('div', null,
    createElement(ModalHost),
    createElement('div', { 'data-lexical-editor': 'true' },
      heading ? createElement('h2', null, heading) : null,
      createElement('p', null, 'Agent 每轮结束后，改过的 artifact 会同步到云端。'),
      createElement('div', null, createElement(MermaidPreview, { content: source })),
    ),
  );
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: page })));
  return host;
}

async function openViewer() {
  const trigger = document.querySelector<HTMLElement>('[aria-label="放大查看 Mermaid 图"]');
  expect(trigger).not.toBeNull();
  await act(async () => trigger!.click());
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  expect(dialog).not.toBeNull();
  return dialog!;
}

test('clicking a diagram opens a viewer titled by the nearest heading above it', async () => {
  await renderDocument('发布流程');
  const dialog = await openViewer();
  expect(dialog.textContent).toContain('发布流程');
  expect(dialog.textContent).toContain('flowchart');
  expect(dialog.querySelector('img[alt="Mermaid diagram"]')).not.toBeNull();
});

test('a diagram with no heading above it opens a viewer with a generic title', async () => {
  await renderDocument(null);
  const dialog = await openViewer();
  expect(dialog.textContent).toContain('Mermaid 图');
});

test('the viewer copies the diagram source', async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  await renderDocument('发布流程');
  const dialog = await openViewer();
  const copy = [...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('复制源码'));
  expect(copy).toBeDefined();
  await act(async () => copy!.click());
  expect(writeText).toHaveBeenCalledWith(source);
  vi.unstubAllGlobals();
});

test('the inline diagram cannot be dragged into the document as an image', async () => {
  const host = await renderDocument('发布流程');
  const image = host.querySelector<HTMLImageElement>('[aria-label="放大查看 Mermaid 图"] img');
  expect(image).toBeInstanceOf(HTMLImageElement);
  expect(image!.getAttribute('draggable')).toBe('false');
});
