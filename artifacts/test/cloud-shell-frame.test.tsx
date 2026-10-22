// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { CloudShell } from '../src/viewer/layouts/CloudShell';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}), defineConsts: (value: unknown) => value, defineVars: (value: unknown) => value }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function mount(owner = true) {
  vi.stubGlobal('fetch', async () => Response.json({ type: 'document', title: 'Memory eval', owner, visibility: 'private' }));
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(CloudShell, { id: 'c1' })));
  host.querySelector('iframe')!.srcdoc = '<!doctype html><html><body></body></html>';
  return host;
}

test('the artifact frame is allowed to reach this computer', async () => {
  const host = await mount();
  const allow = host.querySelector('iframe')!.getAttribute('allow')!.split(';').map((part) => part.trim());
  expect(allow).toEqual(expect.arrayContaining(['clipboard-write', 'local-network-access', 'loopback-network']));
});

test('the header links back to the cloud library and identifies the artifact by title', async () => {
  const host = await mount();
  expect(host.querySelector('header a[href="/"]')?.getAttribute('aria-label')).toBe('返回 Ryugi Cloud 列表');
  expect(host.querySelector('nav[aria-label="面包屑"]')?.textContent).toContain('document');
  expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Memory eval');
  expect(host.textContent).not.toContain('你的 artifact');
});

test('only the artifact frame can update the header, including live title and offline status', async () => {
  const host = await mount();
  const frame = host.querySelector('iframe')!.contentWindow;
  const update = async (data: unknown, source = frame, origin = location.origin) => act(async () => {
    window.dispatchEvent(new MessageEvent('message', { source, origin, data }));
  });
  const data = { type: 'ryugi:cloud-header', id: 'c1', title: 'Updated eval', online: true, comments: 3, activity: 'Codex 正在编辑', retrying: true, reason: null };
  await update(data, window);
  await update(data, frame, 'https://untrusted.example');
  await update({ ...data, id: 'another-artifact' });
  expect(host.textContent).not.toContain('电脑在线');
  await update(data);
  expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Updated eval');
  expect(document.title).toBe('Updated eval');
  expect(host.textContent).toContain('电脑在线');
  expect(host.textContent).toContain('评论 3');
  expect(host.textContent).toContain('Codex 正在编辑');
  expect(host.textContent).toContain('未同步，正在重试');
  await update({ ...data, online: false, comments: 0, activity: null, retrying: false });
  expect(host.textContent).toContain('电脑离线');
  expect(host.textContent).toContain('评论 0');
  expect(host.textContent).not.toContain('Codex 正在编辑');
  await update({ ...data, activity: 'Codex 7 分钟没有更新 · 还有 3 节待写', activityTone: 'warning' });
  expect(host.querySelector('[title="Codex 7 分钟没有更新 · 还有 3 节待写"]')?.getAttribute('data-tone')).toBe('warning');
  await update({ ...data, activity: 'Codex 正在编辑', activityTone: 'loud' });
  expect(host.querySelector('[title="Codex 正在编辑"]')?.getAttribute('data-tone')).toBe('live');
  await update({ ...data, online: false, comments: 0, activity: null, retrying: false });
  await update({ ...data, title: {}, online: 'yes', comments: -1, activity: {}, retrying: 'yes' });
  expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Updated eval');
  expect(host.textContent).toContain('电脑离线');
  expect(host.textContent).toContain('评论 0');
});

test('visitors get the same navigation without owner share controls', async () => {
  const host = await mount(false);
  expect(host.querySelector('header a[href="/"]')).not.toBeNull();
  expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Memory eval');
  expect(host.textContent).toContain('开始使用');
  expect(Array.from(host.querySelectorAll('button')).some((button) => button.textContent === '分享')).toBe(false);
});
