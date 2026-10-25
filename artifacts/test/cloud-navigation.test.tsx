// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { ConfigProvider } from '@lobehub/ui';
import { motion, MotionGlobalConfig } from 'motion/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { Shell } from '../src/viewer/Shell';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}), defineConsts: (value: unknown) => value, defineVars: (value: unknown) => value }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('../src/viewer/components/ArtifactThumbnail', () => ({ ArtifactThumbnail: () => createElement('div') }));

let root: Root | null = null;

const month = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
const OVERVIEW = {
  login: 'innei', profilePath: '/innei',
  views: { days: month.map((day) => ({ day, views: 0 })), total: 0, previous: 0 }, top: [], today: [], publicArtifacts: 0, viewedThisWeek: 0, publishes: { days: month.map((day) => ({ day, publishes: 0 })), total: 0 },
};
const ACCOUNT = { login: 'innei', profilePath: '/innei', email: null, avatarUrl: null, joinedAt: '2026-06-18T08:00:00Z', profile: { shown: 0, hidden: 0 }, sessions: [] };
const PROFILE = { login: 'innei', profilePath: '/innei', avatarUrl: null, joinedAt: '2026-06-18T08:00:00Z', owner: true, artifacts: [] };

const respond = (url: string) => {
  if (url === '/api/account/artifacts') return Response.json({ login: 'innei', profilePath: '/innei', artifacts: [] });
  if (url === '/api/account/overview') return Response.json(OVERVIEW);
  if (url === '/api/account') return Response.json(ACCOUNT);
  if (url === '/api/session') return Response.json({ login: 'innei' });
  if (url.startsWith('/api/u/')) return Response.json(PROFILE);
  return Response.json(null, { status: 404 });
};

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

beforeEach(() => {
  document.documentElement.dataset.ryugiHost = 'cloud';
  history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => respond(String(input))));
  vi.spyOn(window, 'scrollTo').mockImplementation((() => Promise.resolve()) as never);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete document.documentElement.dataset.ryugiHost;
  document.body.innerHTML = '';
});

async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: createElement(Shell) })));
  await act(async () => {});
  return host;
}

async function follow(host: HTMLElement, selector: string) {
  const link = host.querySelector<HTMLAnchorElement>(selector);
  expect(link, selector).not.toBeNull();
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  await act(async () => { link!.dispatchEvent(event); });
  await act(async () => {});
  return event;
}

describe('cloud dashboard navigation', () => {
  test('the Overview tab switches pages in place and Back returns to the list', async () => {
    const host = await mount();
    expect(host.querySelector('a[aria-current="page"]')?.textContent).toBe('Artifacts');
    const click = await follow(host, 'a[href="/overview"]');
    expect(click.defaultPrevented).toBe(true);
    expect(location.pathname).toBe('/overview');
    expect(host.querySelector('a[aria-current="page"]')?.textContent).toBe('Overview');
    await act(async () => {
      history.back();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {});
    expect(location.pathname).toBe('/');
    expect(host.querySelector('a[aria-current="page"]')?.textContent).toBe('Artifacts');
  });

  test('the header stays mounted across the dashboard pages and reads the plan once', async () => {
    const host = await mount();
    const header = host.querySelector('header.cloud-topbar');
    expect(header).not.toBeNull();
    await follow(host, 'a[href="/overview"]');
    expect(host.querySelector('header.cloud-topbar')).toBe(header);
    await follow(host, 'a[href="/account"]');
    expect(host.querySelector('header.cloud-topbar')).toBe(header);
    await follow(host, 'a[href="/"]');
    expect(host.querySelector('header.cloud-topbar')).toBe(header);
    const billing = vi.mocked(fetch).mock.calls.filter(([input]) => String(input) === '/api/billing');
    expect(billing).toHaveLength(1);
  });

  test('the account and profile pages are reached in place too', async () => {
    const host = await mount();
    expect((await follow(host, 'a[href="/account"]')).defaultPrevented).toBe(true);
    expect(host.querySelector('.account-main')).not.toBeNull();
    expect((await follow(host, '.account-who a[href="/innei"]')).defaultPrevented).toBe(true);
    expect(location.pathname).toBe('/innei');
    expect(host.querySelector('.profile-main h1')?.textContent).toBe('innei');
    expect((await follow(host, 'a.profile-top-link[href="/"]')).defaultPrevented).toBe(true);
    expect(location.pathname).toBe('/');
  });

  test('billing still loads as a full page', async () => {
    history.replaceState(null, '', '/account');
    const host = await mount();
    expect((await follow(host, 'a.cloud-button[href="/billing"]')).defaultPrevented).toBe(false);
  });

  test('a modified click is left to the browser', async () => {
    const host = await mount();
    const link = host.querySelector<HTMLAnchorElement>('a[href="/overview"]')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, metaKey: true });
    await act(async () => { link.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
  });
});
