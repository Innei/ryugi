// @vitest-environment happy-dom
// @vitest-environment-options { "settings": { "disableIframePageLoading": true } }
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { CloudShell } from '../src/viewer/layouts/CloudShell';
import { useCloudSharePanel } from '../src/viewer/components/CloudBanner';

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
  history.replaceState(null, '', '/');
});

async function mount(owner = true, published = false) {
  vi.stubGlobal('fetch', async () => Response.json({ type: 'document', title: 'Memory eval', owner, visibility: 'private', published, publishedAt: published ? '2026-10-24T06:20:00Z' : null }));
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
  expect(host.querySelector('header a[href="/"]')?.getAttribute('aria-label')).toBe('Back to the Ryugi Cloud list');
  expect(host.querySelector('nav[aria-label="Breadcrumb"]')?.textContent).toContain('document');
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
  expect(host.textContent).not.toContain('Computer online');
  await update(data);
  expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Updated eval');
  expect(document.title).toBe('Updated eval');
  expect(host.textContent).toContain('Computer online');
  expect(host.textContent).toContain('Comments 3');
  expect(host.textContent).toContain('Codex 正在编辑');
  expect(host.textContent).toContain('Not synced, retrying');
  await update({ ...data, online: false, comments: 0, activity: null, retrying: false });
  expect(host.textContent).toContain('Computer offline');
  expect(host.textContent).toContain('Comments 0');
  expect(host.textContent).not.toContain('Codex 正在编辑');
  await update({ ...data, activity: 'Codex 7 分钟没有更新 · 还有 3 节待写', activityTone: 'warning' });
  expect(host.querySelector('[title="Codex 7 分钟没有更新 · 还有 3 节待写"]')?.getAttribute('data-tone')).toBe('warning');
  await update({ ...data, activity: 'Codex 正在编辑', activityTone: 'loud' });
  expect(host.querySelector('[title="Codex 正在编辑"]')?.getAttribute('data-tone')).toBe('live');
  await update({ ...data, online: false, comments: 0, activity: null, retrying: false });
  await update({ ...data, title: {}, online: 'yes', comments: -1, activity: {}, retrying: 'yes' });
  expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Updated eval');
  expect(host.textContent).toContain('Computer offline');
  expect(host.textContent).toContain('Comments 0');
});

test('visitors get the same navigation without owner share controls', async () => {
  const host = await mount(false);
  expect(host.querySelector('header a[href="/"]')).not.toBeNull();
  expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Memory eval');
  expect(host.textContent).toContain('Get started');
  expect(Array.from(host.querySelectorAll('button')).some((button) => button.textContent === 'Share')).toBe(false);
});

test('sharing keeps the current page and follows later navigation without copying the local key', async () => {
  history.replaceState(null, '', '/a/c1?page=review&key=private#ryugi-host=abcdefghijklmnop');
  function Share() { return useCloudSharePanel({ id: 'c1', visibility: 'private', published: true, onChange: () => {} }); }
  const host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  await act(async () => root!.render(createElement(Share)));
  const link = () => host.querySelector<HTMLInputElement>('input[aria-label="Share link"]')!.value;
  expect(link()).toBe(`${location.origin}/a/c1?page=review`);
  await act(async () => {
    history.replaceState(null, '', '/a/c1?page=first');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(link()).toBe(`${location.origin}/a/c1?page=first`);
});

test('a first publication cannot be copied, even while its local preview is online', async () => {
  const host = await mount();
  const frame = host.querySelector('iframe')!.contentWindow;
  await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame, origin: location.origin, data: { type: 'ryugi:cloud-header', id: 'c1', online: true, publication: { phase: 'uploading', publishedAt: null, autoPublish: true } } })));
  expect(host.textContent).toContain('Uploading');
  function Share() { return useCloudSharePanel({ id: 'c1', visibility: 'public', published: false, publication: { phase: 'uploading', publishedAt: null, autoPublish: true }, onChange: () => {} }); }
  await act(async () => root!.render(createElement(Share)));
  const copy = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Copy'))!;
  expect(copy.disabled).toBe(true);
  expect(host.querySelector('input')!.value).not.toContain('/a/c1');
});

test('a cloud version removed by the local app stops being presented as available', async () => {
  const host = await mount(true, true);
  const frame = host.querySelector('iframe')!.contentWindow;
  await act(async () => window.dispatchEvent(new MessageEvent('message', { source: frame, origin: location.origin, data: { type: 'ryugi:cloud-header', id: 'c1', publication: { phase: 'waiting', publishedAt: null, autoPublish: false } } })));
  expect(host.textContent).toContain('Waiting to publish');
  expect(host.textContent).not.toContain('Changes waiting to publish');
});

test('a failed update can still share the last cloud version and retry the update', async () => {
  const retry = vi.fn();
  function Share() { return useCloudSharePanel({ id: 'c1', visibility: 'public', published: true, publication: { phase: 'failed', publishedAt: '2026-10-24T06:20:00Z', autoPublish: true }, onPublish: retry, onChange: () => {} }); }
  const host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  await act(async () => root!.render(createElement(Share)));
  expect(host.textContent).toContain('previously published version');
  const copy = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Copy'))!;
  expect(copy.disabled).toBe(false);
  const update = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Retry'))!;
  await act(async () => update.click());
  expect(retry).toHaveBeenCalledOnce();
});
