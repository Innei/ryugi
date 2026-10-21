// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { ConfigProvider } from '@lobehub/ui';
import { motion, MotionGlobalConfig } from 'motion/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { cloudPreviewPayload, type CloudArtifactData } from '../src/viewer/lib/cloud-list';
import { groupByProject, type CloudListItem } from '../src/viewer/lib/cloud-list';
import { CloudArtifactList } from '../src/viewer/layouts/CloudArtifactList';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}) }));
vi.mock('../src/viewer/components/ArtifactThumbnail', () => ({
  ArtifactThumbnail: ({ src }: { src: string }) => createElement('div', { className: 'library-thumbnail', 'data-src': src }),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

const item = (id: string, project: string | null, updatedAt: string, extra: Partial<CloudListItem> = {}): CloudListItem => ({
  id, project, updatedAt, type: 'html', title: id, visibility: 'private', url: `https://ryugi.innei.dev/a/${id}`, version: 1, ...extra,
});

describe('groupByProject', () => {
  test('groups by project, newest group and newest artifact first, unnamed last', () => {
    const groups = groupByProject([
      item('a', 'ryugi', '2026-10-21T08:00:00Z'),
      item('b', 'blog', '2026-10-21T09:00:00Z'),
      item('c', null, '2026-10-21T10:00:00Z'),
      item('d', 'ryugi', '2026-10-21T07:00:00Z'),
      item('e', 'ryugi', '2026-10-21T08:30:00Z'),
    ]);
    expect(groups.map((g) => [g.project, g.artifacts.map((a) => a.id)])).toEqual([
      ['blog', ['b']],
      ['ryugi', ['e', 'a', 'd']],
      [null, ['c']],
    ]);
  });

  test('skips artifacts that were created but never published', () => {
    expect(groupByProject([item('a', 'p', '2026-10-21T08:00:00Z', { version: null })])).toEqual([]);
  });
});

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  MotionGlobalConfig.skipAnimations = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function render(response: { status: number; body: unknown }, fetchImpl?: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl ?? vi.fn(async () => new Response(JSON.stringify(response.body), { status: response.status })));
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(CloudArtifactList) })));
  await act(async () => {});
  return host;
}

async function click(text: string, parent: ParentNode = document) {
  const button = Array.from(parent.querySelectorAll<HTMLElement>('button, [role="menuitem"]')).find((node) => node.textContent?.trim() === text);
  expect(button, `button ${text}`).toBeDefined();
  await act(async () => { button!.click(); });
}

async function choose(label: string) {
  const checkbox = document.querySelector<HTMLElement>(`[role="checkbox"][aria-label="${label}"]`);
  expect(checkbox, label).not.toBeNull();
  await act(async () => { (checkbox!.closest('label') ?? checkbox!).click(); });
}

describe('cloud library management', () => {
  const artifacts = [item('a', 'first', '2026-10-21T08:00:00Z', { title: 'Arrow' }), item('b', 'second', '2026-10-21T07:00:00Z', { title: 'Notes' })];
  const list = { login: 'innei', artifacts };

  test('selects across projects and waits for confirmation before deleting', async () => {
    const requests: string[] = [];
    const host = await render({ status: 200, body: list }, (async (url, init) => {
      if (init?.method === 'DELETE') { requests.push(String(url)); return new Response(null, { status: 204 }); }
      return Response.json(list);
    }) as typeof fetch);
    await click('选择');
    await choose('选择项目 first');
    await choose('选择 Notes');
    await click('删除 2 项');
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Arrow');
    expect(dialog.textContent).toContain('Notes');
    expect(requests).toEqual([]);
    await click('取消', dialog);
    expect(host.querySelectorAll('.library-grid > li')).toHaveLength(2);
    await click('删除 2 项');
    await click('删除 2 项', document.querySelector('[role="dialog"]')!);
    expect(requests).toEqual(['/api/a/a', '/api/a/b']);
    expect(host.querySelectorAll('.library-grid > li')).toHaveLength(0);
    expect(host.textContent).toContain('还没有');
  });

  test('keeps failed items selected and retries only those items', async () => {
    let fail = true;
    const requests: string[] = [];
    const host = await render({ status: 200, body: list }, (async (url, init) => {
      if (init?.method !== 'DELETE') return Response.json(list);
      requests.push(String(url));
      return String(url).endsWith('/b') && fail ? Response.json({ error: 'try again' }, { status: 503 }) : new Response(null, { status: 204 });
    }) as typeof fetch);
    await click('选择');
    await choose('选择 Arrow');
    await choose('选择 Notes');
    await click('删除 2 项');
    await click('删除 2 项', document.querySelector('[role="dialog"]')!);
    expect(host.querySelectorAll('.library-grid > li')).toHaveLength(1);
    expect(host.querySelector('.library-grid')?.textContent).toContain('Notes');
    expect(document.querySelector('[role="checkbox"][aria-label="选择 Notes"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('1');
    fail = false;
    await click('重试删除');
    expect(requests).toEqual(['/api/a/a', '/api/a/b', '/api/a/b']);
    expect(host.querySelectorAll('.library-grid > li')).toHaveLength(0);
  });

  test('keeps the list and offers sign-in if a deletion session expires', async () => {
    const requests: string[] = [];
    const host = await render({ status: 200, body: list }, (async (url, init) => {
      if (init?.method !== 'DELETE') return Response.json(list);
      requests.push(String(url));
      return Response.json({ error: 'sign in' }, { status: 401 });
    }) as typeof fetch);
    await click('选择');
    await choose('选择 Arrow');
    await choose('选择 Notes');
    await click('删除 2 项');
    await click('删除 2 项', document.querySelector('[role="dialog"]')!);
    expect(host.querySelectorAll('.library-grid > li')).toHaveLength(2);
    expect(host.querySelector('a[href="/auth/login?return=/"]')).not.toBeNull();
    expect(requests).toEqual(['/api/a/a']);
  });

  test('sharing failures preserve visibility and a later success updates the card', async () => {
    let fail = true;
    const host = await render({ status: 200, body: list }, (async (_url, init) => {
      if (init?.method !== 'PATCH') return Response.json(list);
      return fail ? Response.json({ error: 'try again' }, { status: 503 }) : Response.json({ id: 'a', visibility: 'public' });
    }) as typeof fetch);
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="管理 Arrow"]')!.click(); });
    await click('分享设置');
    const option = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((node) => node.textContent?.includes('有链接的人'))!;
    await act(async () => { option().click(); });
    expect(host.querySelector('.library-card-meta')?.textContent).toContain('私有');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('try again');
    fail = false;
    await act(async () => { option().click(); });
    expect(host.querySelector('.library-card-meta')?.textContent).toContain('公开');
  });

  test('reports clipboard refusal without changing visibility', async () => {
    vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText: async () => { throw new Error('denied'); } } } }));
    const host = await render({ status: 200, body: list });
    await act(async () => { host.querySelector<HTMLButtonElement>('button[aria-label="管理 Arrow"]')!.click(); });
    await click('复制链接');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('复制失败');
    expect(host.querySelector('.library-card-meta')?.textContent).toContain('私有');
  });

  test('can retry an initial loading error', async () => {
    let fail = true;
    const host = await render({ status: 503, body: {} }, (async () => fail ? new Response(null, { status: 503 }) : Response.json(list)) as typeof fetch);
    fail = false;
    await click('重新加载');
    expect(host.querySelectorAll('.library-grid > li')).toHaveLength(2);
  });
});

describe('CloudArtifactList', () => {
  test('signed out, it explains the cloud and links to sign-in', async () => {
    const host = await render({ status: 401, body: { error: 'sign in' } });
    const link = host.querySelector('a[href^="/auth/login"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/auth/login?return=/');
  });

  test('signed in, it lists artifacts under their projects with visibility', async () => {
    const host = await render({
      status: 200,
      body: { login: 'innei', artifacts: [item('a', 'ryugi', '2026-10-21T08:00:00Z', { title: 'Arrow' }), item('b', null, '2026-10-21T07:00:00Z', { title: 'Loose', visibility: 'public' })] },
    });
    expect(host.textContent).toContain('ryugi');
    expect(host.textContent).toContain('Arrow');
    expect(host.textContent).toContain('私有');
    expect(host.textContent).toContain('公开');
    expect((host.querySelector('a[href="/a/a"]') as HTMLAnchorElement).textContent).toContain('Arrow');
  });

  test('signed in with nothing published, it says so', async () => {
    const host = await render({ status: 200, body: { login: 'innei', artifacts: [] } });
    expect(host.textContent).toContain('还没有');
  });
});

describe('thumbnails', () => {
  test('each card previews its cloud copy, reloading when it changes', async () => {
    const host = await render({ status: 200, body: { login: 'innei', artifacts: [item('a', 'ryugi', '2026-10-21T08:00:00Z', { title: 'Arrow' })] } });
    expect(host.querySelector('.library-thumbnail')?.getAttribute('data-src')).toBe(`/a/a/preview?v=${Date.parse('2026-10-21T08:00:00Z')}`);
  });

  test('the top bar keeps "Cloud" at phone width', async () => {
    const host = await render({ status: 401, body: {} });
    expect(host.querySelector('.library-breadcrumb b')?.textContent).toBe('Cloud');
  });
});

describe('cloudPreviewPayload', () => {
  test('maps an artboard to the canvas the preview draws', () => {
    const canvas = { pages: [{ id: 'p' }], boards: {} };
    expect(cloudPreviewPayload({ type: 'artboard', title: 'T', contentBase: '/c/', payload: { canvas, layout: { pages: {} }, versions: { 'a.html': 1 } } } as unknown as CloudArtifactData)).toEqual({
      title: 'T', contentBase: '/c/', canvas, layout: { pages: {} }, versions: { 'a.html': 1 }, pending: [],
    });
  });

  test('maps a document to its editor state and an html page to its title', () => {
    const state = { root: {} };
    expect(cloudPreviewPayload({ type: 'document', title: 'D', contentBase: '/c/', payload: { title: 'D', state } } as unknown as CloudArtifactData)).toEqual({ title: 'D', contentBase: '/c/', state });
    expect(cloudPreviewPayload({ type: 'html', title: 'H', contentBase: '/c/', payload: { title: 'H' } })).toEqual({ title: 'H', contentBase: '/c/' });
  });
});
