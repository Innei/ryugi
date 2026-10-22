// @vitest-environment happy-dom
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createParagraphNode, $createTextNode, $getRoot, type LexicalEditor } from 'lexical';
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { PendingContext, type PendingProgress } from '../src/viewer/document/PendingBlock';
import { $createPendingNode, PendingNode } from '../src/viewer/document/PendingNode';
import { usePendingBlocks } from '../src/viewer/document/usePendingBlocks';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}), keyframes: () => 'k' }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

let root: Root | null = null;
let host: HTMLElement;
let editor: LexicalEditor | null = null;
let progress: ReturnType<typeof usePendingBlocks> | null = null;

beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  editor = null;
  progress = null;
  document.body.innerHTML = '';
});

function Probe() {
  const [composer] = useLexicalComposerContext();
  progress = usePendingBlocks(composer);
  useEffect(() => { editor = composer; }, [composer]);
  return null;
}

async function render(activity: PendingProgress['activity'], children?: ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const initialConfig = {
    namespace: 'pending-test',
    nodes: [PendingNode],
    onError: (err: Error) => { throw err; },
    editorState: () => {
      $getRoot().append(
        $createParagraphNode().append($createTextNode('intro')),
        $createPendingNode('讲清三类存储'),
        $createPendingNode('部署顺序'),
      );
    },
  };
  const Body = () => {
    const [composer] = useLexicalComposerContext();
    const next = usePendingBlocks(composer).firstKey;
    return createElement(PendingContext.Provider, { value: { nextKey: next, agent: 'Codex', activity } },
      createElement(RichTextPlugin, { contentEditable: createElement(ContentEditable), ErrorBoundary: LexicalErrorBoundary }),
      createElement(Probe),
      children,
    );
  };
  await act(async () => root!.render(createElement(LexicalComposer, { initialConfig }, createElement(Body))));
}

const blocks = () => [...host.querySelectorAll<HTMLElement>('[data-pending]')];

test('every pending block shows its intent as ghost text, and only the next one holds the agent caret', async () => {
  await render('working');
  expect(blocks().map((block) => block.textContent)).toEqual(['讲清三类存储Codex', '部署顺序']);
  expect(blocks().map((block) => block.dataset.next)).toEqual(['true', undefined]);
  expect(blocks().map((block) => block.querySelector('[data-caret]') !== null)).toEqual([true, false]);
});

test('a stale document marks the blocks unfinished without an agent', async () => {
  await render('stale');
  expect(blocks().map((block) => block.textContent)).toEqual(['未完成讲清三类存储', '未完成部署顺序']);
  expect(blocks().every((block) => block.dataset.next === undefined)).toBe(true);
  expect(host.querySelector('[data-caret]')).toBeNull();
});

test('counts pending blocks and follows the first as they are filled', async () => {
  await render('working');
  expect(progress?.count).toBe(2);
  const first = progress?.firstKey;
  await act(async () => {
    editor!.update(() => {
      const pending = $getRoot().getChildren().filter((node) => node.getType() === 'pending');
      pending[0]!.replace($createParagraphNode().append($createTextNode('filled')));
    }, { discrete: true });
  });
  expect(progress?.count).toBe(1);
  expect(progress?.firstKey).not.toBe(first);
  expect(blocks().map((block) => block.textContent)).toEqual(['部署顺序Codex']);
});

test('while the agent is streaming a write, the next block does not draw a second caret', async () => {
  await render('editing');
  expect(host.querySelector('[data-caret]')).toBeNull();
  expect(blocks().map((block) => block.textContent)).toEqual(['讲清三类存储', '部署顺序']);
});
