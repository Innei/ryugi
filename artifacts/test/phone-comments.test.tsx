// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { Thread } from '../src/shared/comments';
import type { ThreadActions } from '../src/viewer/document/CommentCard';
import { editMenuPosition } from '../src/viewer/document/layoutCards';
import { PhoneEditMenu } from '../src/viewer/document/PhoneEditMenu';
import { PhoneLayout } from '../src/viewer/document/PhoneLayout';
import { PhoneSheet, raiseSheet, SHEET_FULL, SHEET_HALF, SHEET_PEEK } from '../src/viewer/document/PhoneSheet';
import { PhoneThread } from '../src/viewer/document/PhoneThread';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

async function render(element: ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  return host;
}

async function type(host: HTMLElement, text: string) {
  const box = host.querySelector<HTMLTextAreaElement>('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, text);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Send"]')!.click());
}

const at = '2026-10-21T10:00:00.000Z';
const waiting: Thread = {
  id: 't1',
  anchor: { blockId: 'b1', quote: '每个入口各自解析参数' },
  status: 'open',
  statusAt: at,
  messages: [{ id: 'm1', author: 'human', name: 'innei', text: '这里能合并吗？', at }],
};
const answered: Thread = {
  ...waiting,
  id: 't2',
  messages: [...waiting.messages, { id: 'm2', author: 'agent', name: 'Claude Code', text: '可以，下一轮改。', at }],
};
const actions = (): ThreadActions => ({ reply: vi.fn(async () => true), edit: vi.fn(), remove: vi.fn(), resolve: vi.fn(), reopen: vi.fn() });

test('a thread is flat: quote, state, every message, and a reply line', async () => {
  const thread = actions();
  const host = await render(createElement(PhoneThread, { thread: waiting, agent: 'Claude Code', actions: thread }));
  expect(host.textContent).toContain('每个入口各自解析参数');
  expect(host.textContent).toContain('Waiting on Claude Code');
  expect(host.textContent).toContain('这里能合并吗？');
  await type(host, '顺便看下测试');
  expect(thread.reply).toHaveBeenCalledWith('t1', '顺便看下测试');
});

test('a thread the agent answered says so, and offline threads cannot be answered', async () => {
  const host = await render(createElement(PhoneThread, { thread: answered, agent: 'Claude Code' }));
  expect(host.textContent).toContain('Claude Code replied');
  expect(host.querySelector('textarea')).toBeNull();
});

test('the collapsed sheet counts comments and the ones waiting on the agent', async () => {
  const host = await render(
    createElement(PhoneSheet, { threads: [waiting, answered], agent: 'Claude Code', actions: actions(), offline: false, draft: null, onCreate: vi.fn(), onCancelDraft: vi.fn(), activeId: null, snap: 78, onSnap: vi.fn() }),
  );
  expect(host.querySelector('[data-sheet-head]')!.textContent).toBe('Comments 2· 1 waiting on Claude Code');
});

test('offline, the sheet title says comments wait for the computer', async () => {
  const host = await render(
    createElement(PhoneSheet, { threads: [waiting], agent: 'Claude Code', offline: true, draft: null, onCreate: vi.fn(), onCancelDraft: vi.fn(), activeId: null, snap: 78, onSnap: vi.fn() }),
  );
  expect(host.querySelector('[data-sheet-head]')!.textContent).toBe('Comments 1· Computer offline; commenting is unavailable');
  expect(host.querySelector('textarea')).toBeNull();
});

test('a new comment quotes the selection and closes once the computer has it', async () => {
  const onCreate = vi.fn(async () => true);
  const onCancelDraft = vi.fn();
  const draft = { blockId: 'b1', quote: 'skill 目录里有四个脚本', left: 0, top: 0, right: 0, bottom: 0, range: document.createRange() };
  const host = await render(
    createElement(PhoneSheet, { threads: [], agent: 'Claude Code', actions: actions(), offline: false, draft, onCreate, onCancelDraft, activeId: null, snap: 0.5, onSnap: vi.fn() }),
  );
  expect(host.textContent).toContain('skill 目录里有四个脚本');
  await type(host, '这四个能合成一个吗');
  expect(onCreate).toHaveBeenCalledWith(draft, '这四个能合成一个吗');
  expect(onCancelDraft).toHaveBeenCalled();
});

test('the edit menu offers only what the page can do right now, leaving copy to the system menu', async () => {
  const labels = (host: HTMLElement) => [...host.querySelectorAll('button')].map((b) => b.textContent);
  const handlers = { onComment: vi.fn(), onEdit: vi.fn() };
  const online = await render(createElement(PhoneEditMenu, { left: 0, top: 0, placement: 'below', canComment: true, canEdit: true, ...handlers }));
  expect(labels(online)).toEqual(['Comment', 'Edit text']);
  await act(async () => online.querySelectorAll('button')[1]!.click());
  expect(handlers.onEdit).toHaveBeenCalled();
  act(() => root?.unmount());
  const commentsOnly = await render(createElement(PhoneEditMenu, { left: 0, top: 0, placement: 'below', canComment: true, canEdit: false, ...handlers }));
  expect(labels(commentsOnly)).toEqual(['Comment']);
});

test('the edit menu grows in from the selection it points at', async () => {
  const animate = vi.spyOn(HTMLElement.prototype, 'animate');
  await render(createElement(PhoneEditMenu, { left: 0, top: 0, placement: 'below', canComment: true, canEdit: true, onComment: vi.fn(), onEdit: vi.fn() }));
  expect(animate.mock.calls.some(([frames]) => JSON.stringify(frames).includes('scale(0.96)'))).toBe(true);
  animate.mockRestore();
});

test('the edit menu sits under the selection, clear of the system menu above it, unless the sheet is in the way', () => {
  const selection = { left: 40, top: 120, bottom: 140 };
  const bounds = { left: 8, right: 382 };
  expect(editMenuPosition(selection, bounds, 160, 44, { top: 0, height: 844, reserved: 78 })).toEqual({ left: 40, top: 150, placement: 'below' });
  expect(editMenuPosition({ left: 40, top: 700, bottom: 720 }, bounds, 160, 44, { top: 0, height: 844, reserved: 78 })).toEqual({ left: 40, top: 646, placement: 'above' });
  expect(editMenuPosition({ left: 300, top: 120, bottom: 140 }, bounds, 160, 44, { top: 0, height: 844, reserved: 78 }).left).toBe(222);
});

test('locating a thread scrolls only the sheet body, never the page or the sheet itself', async () => {
  const intoView = vi.fn();
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = intoView;
  const scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTo').mockImplementation(() => {});
  const props = { threads: [waiting, answered], agent: 'Claude Code', actions: actions(), offline: false, draft: null, onCreate: vi.fn(), onCancelDraft: vi.fn(), snap: 0.5, onSnap: vi.fn() };
  const host = await render(createElement(PhoneSheet, { ...props, activeId: null }));
  await act(async () => root!.render(createElement(PhoneSheet, { ...props, activeId: answered.id })));
  expect(intoView).not.toHaveBeenCalled();
  expect(scrollTo).toHaveBeenCalled();
  expect((scrollTo.mock.contexts.at(-1) as Element).hasAttribute('data-sheet-body')).toBe(true);
  expect(host.querySelector('[data-sheet-body]')).not.toBeNull();
  scrollTo.mockRestore();
  Element.prototype.scrollIntoView = original;
});

test('locating a thread flashes it once the sheet scrolls to it', async () => {
  const animate = vi.spyOn(HTMLElement.prototype, 'animate');
  const props = { threads: [waiting], agent: 'Claude Code', actions: actions(), offline: false, draft: null, onCreate: vi.fn(), onCancelDraft: vi.fn(), snap: 0.5, onSnap: vi.fn() };
  const host = await render(createElement(PhoneSheet, { ...props, activeId: null }));
  expect(animate.mock.calls.some(([frames]) => JSON.stringify(frames).includes('backgroundColor'))).toBe(false);
  await act(async () => root!.render(createElement(PhoneSheet, { ...props, activeId: waiting.id })));
  const flashed = animate.mock.contexts.find((_, i) => JSON.stringify(animate.mock.calls[i]![0]).includes('backgroundColor')) as Element | undefined;
  expect(flashed?.getAttribute('data-thread')).toBe(waiting.id);
  expect(host.contains(flashed!)).toBe(true);
  animate.mockRestore();
});

describe('phone layout', () => {
  const selection = { blockId: 'b1', quote: '四个脚本', left: 40, top: 120, right: 120, bottom: 140, range: document.createRange() };
  const layout = (props: Partial<Parameters<typeof PhoneLayout>[0]>) =>
    createElement(PhoneLayout, {
      editor: null,
      threads: [waiting],
      actions: actions(),
      agent: 'Claude Code',
      canComment: true,
      canEdit: true,
      offline: false,
      selection,
      clearSelection: vi.fn(),
      onCreate: vi.fn(async () => true),
      onEdit: vi.fn(),
      children: createElement('p', null, '正文'),
      ...props,
    });
  const button = (host: HTMLElement, label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === label)!;

  test('Comment raises the sheet to half with a composer quoting the selection', async () => {
    const host = await render(layout({}));
    expect(host.querySelector('section')!.dataset.snap).toBe('78');
    await act(async () => button(host, 'Comment').click());
    expect(host.querySelector('section')!.dataset.snap).toBe('0.5');
    expect(host.querySelector('section')!.textContent).toContain('四个脚本');
    expect(host.querySelector('textarea[placeholder="Comment for the agent…"]')).not.toBeNull();
  });

  test('Edit text hands the selection to the page', async () => {
    const onEdit = vi.fn();
    const host = await render(layout({ onEdit }));
    await act(async () => button(host, 'Edit text').click());
    expect(onEdit).toHaveBeenCalledWith(selection);
  });

  test('with the sheet at half the menu moves above a selection the sheet would cover', async () => {
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844);
    const host = await render(layout({}));
    await act(async () => button(host, 'Comment').click());
    await act(async () => button(host, 'Cancel').click());
    const low = { ...selection, top: 380, bottom: 400 };
    await act(async () => root!.render(layout({ selection: low })));
    expect(host.querySelector('[data-edit-menu]')!.getAttribute('data-placement')).toBe('above');
  });

  test('offline, no edit menu covers the selection', async () => {
    const host = await render(layout({ canComment: false, canEdit: false, offline: true, actions: undefined }));
    expect(host.querySelector('[data-edit-menu]')).toBeNull();
  });
});

test('opening a thread raises a collapsed sheet to half and leaves a taller one alone', () => {
  expect(raiseSheet(SHEET_PEEK)).toBe(SHEET_HALF);
  expect(raiseSheet(SHEET_HALF)).toBe(SHEET_HALF);
  expect(raiseSheet(SHEET_FULL)).toBe(SHEET_FULL);
});

describe('going offline keeps what the owner is typing', () => {
  test('a thread keeps its reply box offline but cannot be resolved', async () => {
    const host = await render(createElement(PhoneThread, { thread: waiting, agent: 'Claude Code', actions: actions(), offline: true }));
    expect(host.querySelector('textarea[placeholder="Reply…"]')).not.toBeNull();
    expect([...host.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('Resolve');
  });

  test('a new comment being written survives the computer dropping', async () => {
    const selection = { blockId: 'b1', quote: '四个脚本', left: 40, top: 120, right: 120, bottom: 140, range: document.createRange() };
    const props = {
      editor: null,
      threads: [waiting],
      actions: actions(),
      agent: 'Claude Code',
      selection,
      clearSelection: vi.fn(),
      onCreate: vi.fn(async () => false),
      onEdit: vi.fn(),
      children: createElement('p', null, '正文'),
    };
    const host = await render(createElement(PhoneLayout, { ...props, canComment: true, canEdit: true, offline: false }));
    await act(async () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Comment')!.click());
    await act(async () => root!.render(createElement(PhoneLayout, { ...props, selection: null, canComment: false, canEdit: false, offline: true })));
    expect(host.querySelector('textarea[placeholder="Comment for the agent…"]')).not.toBeNull();
  });
});

test('a finger dragging the sheet title moves it between heights', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(844);
  const onSnap = vi.fn();
  const host = await render(
    createElement(PhoneSheet, { threads: [waiting], agent: 'Claude Code', actions: actions(), offline: false, draft: null, onCreate: vi.fn(), onCancelDraft: vi.fn(), activeId: null, snap: 78, onSnap }),
  );
  const title = host.querySelector('[data-sheet-head]')!;
  title.setPointerCapture = vi.fn();
  const finger = (type: string, y: number) => act(async () => title.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 5, pointerType: 'touch', clientX: 50, clientY: y })));
  await finger('pointerdown', 800);
  await finger('pointermove', 700);
  await finger('pointerup', 700);
  expect(onSnap).toHaveBeenLastCalledWith(SHEET_HALF);
});
