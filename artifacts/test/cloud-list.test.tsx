// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { ConfigProvider } from '@lobehub/ui';
import { motion, MotionGlobalConfig } from 'motion/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { cloudPreviewPayload, filterCloudItems, projectCounts, publishedNewestFirst, type CloudArtifactData } from '../src/viewer/lib/cloud-list';
import { groupByProject, type CloudListItem } from '../src/viewer/lib/cloud-list';
import { CloudArtifactList } from '../src/viewer/layouts/CloudArtifactList';
import { CloudHeader } from '../src/viewer/components/CloudBanner';

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

describe('list filters', () => {
  const items = [
    item('a', 'ryugi', '2026-10-21T08:00:00Z', { type: 'artboard', visibility: 'public' }),
    item('b', 'blog', '2026-10-21T09:00:00Z', { type: 'document' }),
    item('c', null, '2026-10-21T10:00:00Z', { type: 'html', visibility: 'public' }),
    item('d', 'ryugi', '2026-10-21T07:00:00Z', { type: 'html', version: null }),
  ];

  test('lists every published artifact newest first, across projects', () => {
    expect(publishedNewestFirst(items).map((a) => a.id)).toEqual(['c', 'b', 'a']);
  });

  test('counts published artifacts per project in project order, unnamed last', () => {
    expect(projectCounts(items)).toEqual([{ project: 'blog', count: 1 }, { project: 'ryugi', count: 1 }, { project: null, count: 1 }]);
  });

  test('filters by project, visibility and type together, where null project means unnamed', () => {
    const list = publishedNewestFirst(items);
    expect(filterCloudItems(list, {}).map((a) => a.id)).toEqual(['c', 'b', 'a']);
    expect(filterCloudItems(list, { project: null }).map((a) => a.id)).toEqual(['c']);
    expect(filterCloudItems(list, { project: 'ryugi' }).map((a) => a.id)).toEqual(['a']);
    expect(filterCloudItems(list, { visibility: 'public' }).map((a) => a.id)).toEqual(['c', 'a']);
    expect(filterCloudItems(list, { visibility: 'public', type: 'html' }).map((a) => a.id)).toEqual(['c']);
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

async function press(selector: string, parent: ParentNode = document) {
  const node = parent.querySelector<HTMLElement>(selector);
  expect(node, selector).not.toBeNull();
  await act(async () => { node!.click(); });
}

async function choose(label: string) {
  const checkbox = document.querySelector<HTMLElement>(`[role="checkbox"][aria-label="${label}"]`);
  expect(checkbox, label).not.toBeNull();
  await act(async () => { (checkbox!.closest('label') ?? checkbox!).click(); });
}

const rows = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>('.cloud-row'));
const row = (host: HTMLElement, title: string) => rows(host).find((node) => node.querySelector('.cloud-row-title')?.textContent === title);
const inspector = (host: HTMLElement) => host.querySelector<HTMLElement>('section[aria-label="详情"]')!;
const visibilitySwitch = (host: HTMLElement) => inspector(host).querySelector<HTMLElement>('[role="switch"]')!;
const isDisabled = (node: HTMLElement) => node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true' || node.hasAttribute('data-disabled');
const shareOption = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((node) => node.textContent?.includes(label))!;

describe('cloud library management', () => {
  const artifacts = [item('a', 'first', '2026-10-21T08:00:00Z', { title: 'Arrow' }), item('b', 'second', '2026-10-21T07:00:00Z', { title: 'Notes' })];
  const list = { login: 'innei', artifacts };

  test('selects across projects and waits for confirmation before deleting', async () => {
    const requests: string[] = [];
    const host = await render({ status: 200, body: list }, (async (url, init) => {
      if (init?.method === 'DELETE') { requests.push(String(url)); return new Response(null, { status: 204 }); }
      return Response.json(list);
    }) as typeof fetch);
    await press('button[aria-label="选择多项"]');
    await choose('选择 Arrow');
    await choose('选择 Notes');
    expect(inspector(host).textContent).toContain('已选 2 项');
    await click('删除 2 项');
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Arrow');
    expect(dialog.textContent).toContain('Notes');
    expect(requests).toEqual([]);
    await click('取消', dialog);
    expect(rows(host)).toHaveLength(2);
    await click('删除 2 项');
    await click('删除 2 项', document.querySelector('[role="dialog"]')!);
    expect(requests).toEqual(['/api/a/a', '/api/a/b']);
    expect(rows(host)).toHaveLength(0);
    expect(host.textContent).toContain('还没有');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('已删除 2 项');
  });

  test('select all picks only what the current filter shows', async () => {
    const host = await render({ status: 200, body: list });
    await click('first1');
    await press('button[aria-label="选择多项"]');
    await choose('全选当前列表');
    expect(inspector(host).textContent).toContain('已选 1 项');
    expect(inspector(host).textContent).toContain('Arrow');
    expect(inspector(host).textContent).not.toContain('Notes');
  });

  test('keeps failed items selected and retries only those items', async () => {
    let fail = true;
    const requests: string[] = [];
    const host = await render({ status: 200, body: list }, (async (url, init) => {
      if (init?.method !== 'DELETE') return Response.json(list);
      requests.push(String(url));
      return String(url).endsWith('/b') && fail ? Response.json({ error: 'try again' }, { status: 503 }) : new Response(null, { status: 204 });
    }) as typeof fetch);
    await press('button[aria-label="选择多项"]');
    await choose('选择 Arrow');
    await choose('选择 Notes');
    await click('删除 2 项');
    await click('删除 2 项', document.querySelector('[role="dialog"]')!);
    expect(rows(host)).toHaveLength(1);
    expect(row(host, 'Notes')).toBeDefined();
    expect(document.querySelector('[role="checkbox"][aria-label="选择 Notes"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('1');
    fail = false;
    await click('重试删除');
    expect(requests).toEqual(['/api/a/a', '/api/a/b', '/api/a/b']);
    expect(rows(host)).toHaveLength(0);
  });

  test('keeps the list and offers sign-in if a deletion session expires', async () => {
    const requests: string[] = [];
    const host = await render({ status: 200, body: list }, (async (url, init) => {
      if (init?.method !== 'DELETE') return Response.json(list);
      requests.push(String(url));
      return Response.json({ error: 'sign in' }, { status: 401 });
    }) as typeof fetch);
    await press('button[aria-label="选择多项"]');
    await choose('选择 Arrow');
    await choose('选择 Notes');
    await click('删除 2 项');
    await click('删除 2 项', document.querySelector('[role="dialog"]')!);
    expect(rows(host)).toHaveLength(2);
    expect(host.querySelector('a[href="/auth/login?return=/"]')).not.toBeNull();
    expect(requests).toEqual(['/api/a/a']);
  });

  test('deletes the inspected artifact after confirmation and inspects the next one', async () => {
    const requests: string[] = [];
    const host = await render({ status: 200, body: list }, (async (url, init) => {
      if (init?.method === 'DELETE') { requests.push(String(url)); return new Response(null, { status: 204 }); }
      return Response.json(list);
    }) as typeof fetch);
    await click('删除…', inspector(host));
    expect(requests).toEqual([]);
    await click('删除 1 项', document.querySelector('[role="dialog"]')!);
    expect(requests).toEqual(['/api/a/a']);
    expect(rows(host)).toHaveLength(1);
    expect(inspector(host).querySelector('h2')?.textContent).toBe('Notes');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('已删除 1 项');
  });

  test('sharing failures preserve visibility and a later success updates the row', async () => {
    let fail = true;
    const host = await render({ status: 200, body: list }, (async (_url, init) => {
      if (init?.method !== 'PATCH') return Response.json(list);
      return fail ? Response.json({ error: 'try again' }, { status: 503 }) : Response.json({ id: 'a', visibility: 'public' });
    }) as typeof fetch);
    expect(inspector(host).querySelector('[role="radio"]')).toBeNull();
    expect(inspector(host).textContent).toContain('有链接的人可以看');
    expect(visibilitySwitch(host).getAttribute('aria-checked')).toBe('false');
    await act(async () => { visibilitySwitch(host).click(); });
    expect(row(host, 'Arrow')?.textContent).toContain('仅自己');
    expect(visibilitySwitch(host).getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('try again');
    fail = false;
    await act(async () => { visibilitySwitch(host).click(); });
    expect(row(host, 'Arrow')?.textContent).toContain('有链接');
    expect(visibilitySwitch(host).getAttribute('aria-checked')).toBe('true');
  });

  test('a pending visibility change keeps its options disabled until the server answers', async () => {
    let settle: (response: Response) => void = () => {};
    let requests = 0;
    const host = await render({ status: 200, body: list }, (async (_url, init) => {
      if (init?.method !== 'PATCH') return Response.json(list);
      requests++;
      return new Promise<Response>((resolve) => { settle = resolve; });
    }) as typeof fetch);
    await act(async () => { visibilitySwitch(host).click(); });
    expect(isDisabled(visibilitySwitch(host))).toBe(true);
    await act(async () => { visibilitySwitch(host).click(); });
    expect(requests).toBe(1);
    await act(async () => { settle(Response.json({ error: 'sign in' }, { status: 401 })); });
    expect(isDisabled(visibilitySwitch(host))).toBe(false);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('登录已过期');
    expect(document.querySelector('a[href^="/auth/login"]')).not.toBeNull();
  });

  test('reports clipboard refusal without changing visibility', async () => {
    vi.stubGlobal('navigator', Object.create(navigator, { clipboard: { value: { writeText: async () => { throw new Error('denied'); } } } }));
    const host = await render({ status: 200, body: list });
    await click('复制', inspector(host));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('复制失败');
    expect(row(host, 'Arrow')?.textContent).toContain('仅自己');
  });

  test('making the inspected artifact public under a 仅自己 filter keeps it in the inspector', async () => {
    const host = await render({ status: 200, body: list }, (async (_url, init) => {
      if (init?.method !== 'PATCH') return Response.json(list);
      return Response.json({ id: 'a', visibility: 'public' });
    }) as typeof fetch);
    await click('仅自己2');
    expect(inspector(host).querySelector('h2')?.textContent).toBe('Arrow');
    await act(async () => { visibilitySwitch(host).click(); });
    expect(inspector(host).querySelector('h2')?.textContent).toBe('Arrow');
    expect(visibilitySwitch(host).getAttribute('aria-checked')).toBe('true');
  });

  test('keyboard focus follows select mode in and out', async () => {
    await render({ status: 200, body: list });
    await press('button[aria-label="选择多项"]');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('全选当前列表');
    await click('取消');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('选择多项');
  });

  test('after a confirmed delete, focus lands on the next inspected artifact', async () => {
    const host = await render({ status: 200, body: list }, (async (_url, init) => init?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(list)) as typeof fetch);
    await click('删除…', inspector(host));
    await click('删除 1 项', document.querySelector('[role="dialog"]')!);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(document.activeElement).toBe(inspector(host).querySelector('h2'));
  });

  test('on a narrow screen, picking a row scrolls the inspector into view', async () => {
    const original = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => query === '(max-width: 860px)' ? { ...original(query), matches: true } : original(query));
    const scrolled: Element[] = [];
    Element.prototype.scrollIntoView = function (this: Element) { scrolled.push(this); };
    const host = await render({ status: 200, body: list });
    await act(async () => { row(host, 'Notes')!.click(); });
    expect(scrolled).toContain(inspector(host));
    vi.restoreAllMocks();
  });

  test('keeps pending sharing and late errors across dismissal in the header', async () => {
    let settle: (response: Response) => void = () => {};
    let requests = 0;
    await render({ status: 200, body: list }, (async (_url, init) => {
      if (init?.method !== 'PATCH') return Response.json(list);
      requests++;
      return new Promise<Response>((resolve) => { settle = resolve; });
    }) as typeof fetch);
    await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(CloudHeader, { id: 'a', type: 'html', title: 'Arrow', owner: true, status: {}, visibility: 'private', onChange: () => {} }) })));
    for (const status of [503, 401]) {
      await click('分享');
      await act(async () => { shareOption('有链接的人').click(); });
      await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      await click('分享');
      expect(shareOption('有链接的人').disabled).toBe(true);
      await act(async () => { shareOption('有链接的人').click(); });
      expect(requests).toBe(status === 503 ? 1 : 2);
      await act(async () => { settle(Response.json({ error: 'late refusal' }, { status })); });
      expect(shareOption('有链接的人').disabled).toBe(false);
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(status === 401 ? '登录已过期' : 'late refusal');
      if (status === 401) expect(document.querySelector('a[href^="/auth/login"]')).not.toBeNull();
      await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    }
  });

  test('the manual-copy fallback exposes the complete link to keyboard users', async () => {
    await render({ status: 200, body: list });
    const input = document.querySelector<HTMLInputElement>('input[aria-label="分享链接"]');
    expect(input).not.toBeNull();
    expect(input!.readOnly).toBe(true);
    expect(input!.value).toBe(`${location.origin}/a/a`);
    await act(async () => { input!.focus(); });
    expect(input!.selectionStart).toBe(0);
    expect(input!.selectionEnd).toBe(input!.value.length);
  });

  test('can retry an initial loading error', async () => {
    let fail = true;
    const host = await render({ status: 503, body: {} }, (async () => fail ? new Response(null, { status: 503 }) : Response.json(list)) as typeof fetch);
    fail = false;
    await click('重新加载');
    expect(rows(host)).toHaveLength(2);
  });
});

describe('CloudArtifactList', () => {
  test('signed out, it explains the cloud and links to sign-in', async () => {
    const host = await render({ status: 401, body: { error: 'sign in' } });
    const link = host.querySelector('a[href^="/auth/login"]') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/auth/login?return=/');
  });

  test('signed in, it lists artifacts with their project and who can see them', async () => {
    const host = await render({
      status: 200,
      body: { login: 'innei', artifacts: [item('a', 'ryugi', '2026-10-21T08:00:00Z', { title: 'Arrow' }), item('b', null, '2026-10-21T07:00:00Z', { title: 'Loose', visibility: 'public' })] },
    });
    expect(row(host, 'Arrow')?.textContent).toContain('ryugi');
    expect(row(host, 'Arrow')?.textContent).toContain('仅自己');
    expect(row(host, 'Loose')?.textContent).toContain('其他');
    expect(row(host, 'Loose')?.textContent).toContain('有链接');
    expect(inspector(host).querySelector('a[href="/a/a"]')?.textContent).toContain('打开');
  });

  test('clicking a row inspects that artifact', async () => {
    const host = await render({ status: 200, body: { login: 'innei', artifacts: [item('a', 'ryugi', '2026-10-21T08:00:00Z', { title: 'Arrow' }), item('b', null, '2026-10-21T07:00:00Z', { title: 'Loose' })] } });
    expect(row(host, 'Arrow')?.getAttribute('aria-pressed')).toBe('true');
    await act(async () => { row(host, 'Loose')!.click(); });
    expect(row(host, 'Loose')?.getAttribute('aria-pressed')).toBe('true');
    expect(inspector(host).querySelector('h2')?.textContent).toBe('Loose');
    expect(inspector(host).querySelector('a[href="/a/b"]')).not.toBeNull();
  });

  test('filters by type, visibility and project, and offers to clear an empty result', async () => {
    const host = await render({ status: 200, body: { login: 'innei', artifacts: [
      item('a', 'ryugi', '2026-10-21T08:00:00Z', { title: 'Arrow', type: 'artboard' }),
      item('b', 'blog', '2026-10-21T07:00:00Z', { title: 'Notes', type: 'document', visibility: 'public' }),
    ] } });
    await click('Document');
    expect(rows(host).map((node) => node.querySelector('.cloud-row-title')?.textContent)).toEqual(['Notes']);
    await click('仅自己1');
    expect(rows(host)).toHaveLength(0);
    await click('清除筛选');
    expect(rows(host)).toHaveLength(2);
    await click('ryugi1');
    expect(rows(host).map((node) => node.querySelector('.cloud-row-title')?.textContent)).toEqual(['Arrow']);
  });

  test('signed in with nothing published, it says so', async () => {
    const host = await render({ status: 200, body: { login: 'innei', artifacts: [] } });
    expect(host.textContent).toContain('还没有');
  });
});

describe('thumbnails', () => {
  test('the inspector previews the cloud copy, reloading when it changes', async () => {
    const host = await render({ status: 200, body: { login: 'innei', artifacts: [item('a', 'ryugi', '2026-10-21T08:00:00Z', { title: 'Arrow' })] } });
    expect(inspector(host).querySelector('.library-thumbnail')?.getAttribute('data-src')).toBe(`/a/a/preview?v=${Date.parse('2026-10-21T08:00:00Z')}`);
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
