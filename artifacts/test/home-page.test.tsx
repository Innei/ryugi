// @vitest-environment happy-dom
import { ConfigProvider, ContextMenuHost } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { HubArtifactList } from '../src/shared/hub';
import { THUMBNAIL_PATH } from '../src/shared/thumbnail';
import { ArtifactList } from '../src/viewer/layouts/ArtifactList';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  defineConsts: (value: unknown) => value,
  defineVars: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

const project = (dir: string, dormant = false) => ({
  dir,
  name: dir.split('/').pop()!,
  lastUsedAt: 0,
  dormant,
  artifacts: 0,
});

const hubList = (): HubArtifactList => ({
  warnings: [],
  projects: [project('/p/two'), project('/p/one'), project('/p/old', true)],
  artifacts: [
    {
      project: '/p/two',
      type: 'artboard',
      id: 'pricing',
      title: 'Pricing page',
      updatedAt: 300,
      url: '/artboard/AAAAAAAAAAAAAAAAAAAAA',
    },
    {
      project: '/p/one',
      type: 'document',
      id: 'signup',
      title: 'Signup flow',
      updatedAt: 200,
      url: '/document/BBBBBBBBBBBBBBBBBBBBB',
    },
    {
      project: '/p/old',
      type: 'html',
      id: 'legacy',
      title: 'Legacy tuner',
      updatedAt: 100,
      url: '/html/CCCCCCCCCCCCCCCCCCCCC',
    },
  ],
});

let root: Root | null = null;
let host: HTMLElement;
const deleted: unknown[] = [];

class FakeSocket {
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: (() => void) | null = null;
  close() {}
  send() {}
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('WebSocket', FakeSocket);
  deleted.length = 0;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/hub/artifacts') return new Response(JSON.stringify(hubList()));
    if (url === '/api/hub/projects' && init?.method === 'DELETE') {
      deleted.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ removed: true }));
    }
    return new Response('{}', { status: 404 });
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <ConfigProvider enableCustomFonts={false} motion={motion}>
        <ArtifactList />
        <ContextMenuHost />
      </ConfigProvider>,
    ),
  );
  await act(async () => {});
}

const cards = () =>
  [...host.querySelectorAll('ul[aria-label] a[aria-label]')].map((a) =>
    a.getAttribute('aria-label'),
  );
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(name))!;
const click = async (element: Element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

test('recent lists every project newest first, with each card naming its project', async () => {
  await render();
  expect(cards()).toEqual(['Open Pricing page', 'Open Signup flow', 'Open Legacy tuner']);
  expect(host.querySelector('ul[aria-label]')!.textContent).toContain('two');
});

test('a card thumbnail URL changes when the drawing version changes, not only the artifact', async () => {
  await render();
  const src = host.querySelector('a[aria-label="Open Signup flow"] img')!.getAttribute('src');
  expect(src).toBe(`/api/thumbnail/document/BBBBBBBBBBBBBBBBBBBBB.svg?v=200&d=${THUMBNAIL_PATH}`);
});

test('picking a project shows only its artifacts', async () => {
  await render();
  await click(button('one'));
  expect(cards()).toEqual(['Open Signup flow']);
});

test('dormant projects stay folded until opened', async () => {
  await render();
  expect(button('old')).toBeUndefined();
  await click(button('Dormant'));
  expect(button('old')).toBeDefined();
});

test('searching all projects reaches past the picked project', async () => {
  await render();
  await click(button('one'));
  const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  await type(search, 'pric');
  expect(cards()).toEqual([]);
  await click(button('All projects'));
  expect(cards()).toEqual(['Open Pricing page']);
});

test('right-clicking a project offers to remove it', async () => {
  await render();
  await act(async () => {
    button('one').dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }),
    );
  });
  const item = [...document.body.querySelectorAll('[role="menuitem"]')].find((el) =>
    el.textContent?.includes('Remove from list'),
  )!;
  await click(item);
  await act(async () => {});
  expect(deleted).toEqual([{ dir: '/p/one' }]);
});

test('⌘K opens a palette grouped by project, ⌘↵ opens a new tab', async () => {
  await render();
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  });
  const dialog = document.body.querySelector('[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  const headings = [...dialog.querySelectorAll('[role="group"]')].map((g) =>
    g.getAttribute('aria-label'),
  );
  expect(headings).toEqual(['two', 'one', 'old']);
  const input = dialog.querySelector<HTMLInputElement>('input')!;
  await type(input, 'signup');
  const opened = vi.spyOn(window, 'open').mockReturnValue(null);
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
    );
  });
  expect(opened).toHaveBeenCalledWith('/document/BBBBBBBBBBBBBBBBBBBBB', '_blank');
});
