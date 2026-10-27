// @vitest-environment happy-dom
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { AgentCaret } from '../src/viewer/document/AgentCaret';
import type { AgentActivity } from '../src/viewer/document/agentActivity';
import { TopBar } from '../src/viewer/document/TopBar';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));
vi.mock('../src/viewer/components/PublishMenu', () => ({ PublishMenu: () => null }));

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
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
    onError: (err: Error) => {
      throw err;
    },
    editorState: () => {
      const paragraph = $createParagraphNode().append($createTextNode('Working text'));
      key = paragraph.getKey();
      $getRoot().append(paragraph);
    },
  };
  const render = async (agent?: string) =>
    act(async () =>
      root!.render(
        createElement(
          LexicalComposer,
          { initialConfig },
          createElement(ContentEditable),
          createElement(AgentCaret, {
            caret: key ? { key, offset: 1 } : null,
            container: host,
            agent,
          }),
          createElement(TopBar, {
            id: 'draft',
            activity: { kind: 'editing' },
            agentSection: '方案',
            offline: false,
            openComments: 0,
            agent,
          }),
        ),
      ),
    );
  await render('Codex');
  await render('Codex');
  expect(host.querySelector('header')?.textContent).toContain('Codex is editing 方案');
  expect(host.querySelector('[aria-hidden]')?.textContent).toBe('Codex');
  await render();
  expect(host.querySelector('header')?.textContent).toContain('Agent is editing 方案');
  expect(host.querySelector('[aria-hidden]')?.textContent).toBe('Agent');
});

test('between writes the bar says what is left, and turns to a warning once the agent goes quiet', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const render = (activity: AgentActivity) =>
    act(async () =>
      root!.render(
        createElement(TopBar, {
          id: 'draft',
          activity,
          agentSection: null,
          offline: false,
          openComments: 0,
          agent: 'Codex',
        }),
      ),
    );
  await render({ kind: 'working', pending: 3, idleMs: 40_000 });
  expect(host.querySelector('header')?.textContent).toContain(
    'Codex has 3 sections left · updated 40s ago',
  );
  await render({ kind: 'stale', pending: 3, idleMs: 6 * 60_000 });
  expect(host.querySelector('header')?.textContent).toContain(
    "Codex hasn't updated in 6 min · 3 sections left",
  );
  await render({ kind: 'idle' });
  expect(host.querySelector('header')?.textContent).not.toContain('Codex');
});
