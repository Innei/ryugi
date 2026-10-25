// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CloudDashboard } from '../src/viewer/layouts/CloudDashboard';
import { CloudOverview } from '../src/viewer/layouts/CloudOverview';
import { parseRoute } from '../src/viewer/lib/route';

vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const days = (values: number[]) => values.map((views, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, views }));
const OVERVIEW = {
  login: 'innei',
  views: { days: days(Array.from({ length: 30 }, (_, i) => (i === 29 ? 86 : 70))), total: 2186, previous: 1852 },
  top: [{ id: 'm1', title: 'Mobile comments', type: 'artboard', views: 388 }, { id: 'd1', title: 'Document history', type: 'document', views: 214 }],
  today: [{ id: 'm1', title: 'Mobile comments', type: 'artboard', views: 52 }],
  publicArtifacts: 5,
  viewedThisWeek: 4,
  publishes: { days: Array.from({ length: 30 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, publishes: i % 3 === 0 ? 0 : 6 })), total: 120 },
};

async function render(body: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/billing' ? Response.json(null, { status: 404 }) : new Response(JSON.stringify(body), { status })));
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(CloudDashboard, { active: 'overview', children: createElement(CloudOverview) }) })));
  await act(async () => {});
  return host;
}

const kpi = (host: HTMLElement, label: string) => Array.from(host.querySelectorAll('.cloud-kpi')).find((node) => node.querySelector('span')?.textContent === label);

describe('CloudOverview', () => {
  test('leads with 30-day page views compared with the 30 days before', async () => {
    const host = await render(OVERVIEW);
    expect(kpi(host, 'Page views · 30 days')?.querySelector('b')?.textContent).toBe('2,186');
    expect(kpi(host, 'Page views · 30 days')?.textContent).toContain('+18% vs previous 30 days');
    expect(kpi(host, 'Public artifacts')?.textContent).toContain('4 viewed this week');
    expect(kpi(host, 'Viewed today')?.querySelector('b')?.textContent).toBe('52');
    expect(kpi(host, 'Publishes · 30 days')?.textContent).toContain('on 20 of 30 days');
  });

  test('draws a bar per day and ranks the most viewed artifacts with links', async () => {
    const host = await render(OVERVIEW);
    expect(host.querySelectorAll('svg[aria-label^="Page views per day"] rect.cloud-bar')).toHaveLength(30);
    const ranked = Array.from(host.querySelectorAll<HTMLAnchorElement>('section[aria-label="Most viewed"] a'));
    expect(ranked.map((link) => [link.getAttribute('href'), link.textContent])).toEqual([['/a/m1', 'Mobile comments388'], ['/a/d1', 'Document history214']]);
  });

  test('hovering a bar names its day and count', async () => {
    const host = await render(OVERVIEW);
    const bar = host.querySelectorAll<SVGRectElement>('svg[aria-label^="Page views per day"] .cloud-bar-hit')[29]!;
    await act(async () => { bar.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); });
    expect(host.querySelector('[role="tooltip"]')?.textContent).toContain('86');
  });

  test('the top bar marks Overview as the current tab and links back to the artifacts', async () => {
    const host = await render(OVERVIEW);
    expect(host.querySelector('a[aria-current="page"]')?.textContent).toBe('Overview');
    expect(host.querySelector<HTMLAnchorElement>('nav a[href="/"]')?.textContent).toBe('Artifacts');
    expect(host.querySelector('a[href="/billing"]')).not.toBeNull();
  });

  test('without any page views it says how to get some', async () => {
    const host = await render({ ...OVERVIEW, views: { days: days(Array(30).fill(0)), total: 0, previous: 0 }, top: [], today: [] });
    expect(host.textContent).toContain('No page views yet');
  });

  test('signed out, it links to sign-in', async () => {
    const host = await render({ error: 'sign in' }, 401);
    expect(host.querySelector('a[href="/auth/login?return=/overview"]')).not.toBeNull();
  });
});

describe('overview route', () => {
  test('lives at /overview on the cloud host only', () => {
    expect(parseRoute('/overview', true)).toEqual({ kind: 'cloud-overview' });
    expect(parseRoute('/overview', false)).toEqual({ kind: 'unknown' });
  });
});
