// @vitest-environment happy-dom
import { act, createElement } from 'react';
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
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function render(response: { status: number; body: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response.body), { status: response.status })));
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(CloudArtifactList)));
  await act(async () => {});
  return host;
}

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
