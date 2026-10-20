// @vitest-environment happy-dom
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { AgentCaret } from '../src/viewer/document/AgentCaret';
import { TopBar } from '../src/viewer/document/TopBar';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('../src/viewer/components/PublishMenu', () => ({ PublishMenu: () => null }));

let root: Root | null = null;
beforeAll(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

test('the document caret and editing status use the detected name and fall back together', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  let key = '';
  const initialConfig = {
    namespace: 'agent-name-test',
    onError: (err: Error) => { throw err; },
    editorState: () => {
      const paragraph = $createParagraphNode().append($createTextNode('Working text'));
      key = paragraph.getKey();
      $getRoot().append(paragraph);
    },
  };
  const render = async (agent?: string) => act(async () => root!.render(
    createElement(LexicalComposer, { initialConfig },
      createElement(ContentEditable),
      createElement(AgentCaret, { caret: key ? { key, offset: 1 } : null, container: host, agent }),
      createElement(TopBar, { id: 'draft', agentEditing: true, agentSection: '方案', offline: false, openComments: 0, agent }),
    ),
  ));
  await render('Codex');
  await render('Codex');
  expect(host.querySelector('header')?.textContent).toContain('Codex 正在编辑 方案');
  expect(host.querySelector('[aria-hidden]')?.textContent).toBe('Codex');
  await render();
  expect(host.querySelector('header')?.textContent).toContain('Agent 正在编辑 方案');
  expect(host.querySelector('[aria-hidden]')?.textContent).toBe('Agent');
});
