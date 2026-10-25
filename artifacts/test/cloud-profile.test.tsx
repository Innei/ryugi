// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { ConfigProvider } from '@lobehub/ui';
import { motion, MotionGlobalConfig } from 'motion/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { CloudAccount } from '../src/viewer/layouts/CloudAccount';
import { CloudProfile } from '../src/viewer/layouts/CloudProfile';
import { parseRoute } from '../src/viewer/lib/route';

vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));
vi.mock('../src/viewer/components/ArtifactThumbnail', () => ({
  ArtifactThumbnail: ({ src }: { src: string }) => createElement('div', { className: 'library-thumbnail', 'data-src': src }),
}));

let root: Root | null = null;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});
type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

async function render(element: ReturnType<typeof createElement>, handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return handler(String(input), init);
  }));
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: element })));
  await act(async () => {});
  return { host, calls };
}

async function clickText(text: string) {
  const button = Array.from(document.querySelectorAll<HTMLElement>('button, a')).find((node) => node.textContent?.trim() === text);
  expect(button, text).toBeDefined();
  await act(async () => { button!.click(); });
}

const art = (id: string, title: string, project: string | null, extra: Record<string, unknown> = {}) => ({ id, title, type: 'html', project, updatedAt: '2026-10-21T08:00:00Z', views: 12, ...extra });
const PROFILE = { login: 'innei', profilePath: '/innei', avatarUrl: null, joinedAt: '2026-06-18T08:00:00Z', owner: false, artifacts: [art('a', 'Arrow', 'ryugi', { views: 388 }), art('b', 'Notes', null)] };
const cards = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLAnchorElement>('a.profile-card'));

describe('public profile', () => {
  test('shows each public artifact with its views, linking to the artifact', async () => {
    const { host } = await render(createElement(CloudProfile, { login: 'innei' }), (url) => url === '/api/session' ? Response.json({ login: null }) : Response.json(PROFILE));
    expect(host.querySelector('h1')?.textContent).toBe('innei');
    expect(cards(host).map((card) => card.getAttribute('href'))).toEqual(['/a/a', '/a/b']);
    expect(cards(host)[0]!.textContent).toContain('388 views');
    expect(cards(host)[0]!.querySelector('.library-thumbnail')?.getAttribute('data-src')).toBe(`/a/a/preview?v=${Date.parse('2026-10-21T08:00:00Z')}`);
    expect(host.querySelector('a[href="/auth/login?return=/innei"]')).not.toBeNull();
  });

  test('project tabs narrow the cards', async () => {
    const { host } = await render(createElement(CloudProfile, { login: 'innei' }), (url) => url === '/api/session' ? Response.json({ login: null }) : Response.json(PROFILE));
    await clickText('ryugi1');
    expect(cards(host).map((card) => card.getAttribute('href'))).toEqual(['/a/a']);
  });

  test('the owner can hide an artifact from the profile, and it stays listed for them as hidden', async () => {
    const mine = { ...PROFILE, owner: true, artifacts: [art('a', 'Arrow', 'ryugi', { hidden: false })] };
    const { host, calls } = await render(createElement(CloudProfile, { login: 'innei' }), (url, init) => {
      if (url === '/api/session') return Response.json({ login: 'innei' });
      if (init?.method === 'PUT') return Response.json({ id: 'a', onProfile: false });
      return Response.json(mine);
    });
    expect(host.textContent).toContain('This is your public profile');
    await clickText('Hide from profile');
    const put = calls.find((call) => call.init?.method === 'PUT')!;
    expect(put.url).toBe('/api/a/a/profile');
    expect(JSON.parse(String(put.init!.body))).toEqual({ shown: false });
    expect(host.querySelector('.profile-card-item.is-hidden')?.textContent).toContain('Hidden');
    expect(host.querySelector('a[href="/"]')?.textContent).toBe('Dashboard');
  });

  test('an unknown login says there is no profile here', async () => {
    const { host } = await render(createElement(CloudProfile, { login: 'ghost' }), (url) => url === '/api/session' ? Response.json({ login: null }) : Response.json({ error: 'no profile here' }, { status: 404 }));
    expect(host.textContent).toContain('No profile here');
  });
});

const ACCOUNT = {
  login: 'innei', profilePath: '/innei', email: 'i@innei.dev', avatarUrl: null, joinedAt: '2026-06-18T08:00:00Z', profile: { shown: 5, hidden: 1 },
  sessions: [{ id: 'aaaaaaaaaaaaaaaa', kind: 'browser', createdAt: '2026-10-21T08:00:00Z', expiresAt: '2026-11-20T08:00:00Z', current: true }, { id: 'bbbbbbbbbbbbbbbb', kind: 'api', createdAt: '2026-10-02T08:00:00Z', expiresAt: '2027-01-01T08:00:00Z', current: false }],
};

describe('account page', () => {
  const handler = (deleteStatus = 204): Handler => (url, init) => {
    if (url === '/api/billing') return Response.json(null, { status: 404 });
    if (init?.method === 'DELETE') return deleteStatus === 204 ? new Response(null, { status: 204 }) : Response.json({ error: 'Cancel Pro on the billing page first; then you can delete the account.', code: 'subscription_active' }, { status: deleteStatus });
    return Response.json(ACCOUNT);
  };

  test('shows the profile link, what it lists and every sign-in', async () => {
    const { host } = await render(createElement(CloudAccount), handler());
    expect(host.querySelector('a[href="/innei"]')).not.toBeNull();
    expect(host.textContent).toContain('5 artifacts');
    expect(host.textContent).toContain('1 hidden');
    expect(host.textContent).toContain('i@innei.dev');
    expect(host.textContent).toContain('This browser');
    expect(host.querySelectorAll('button[data-session]')).toHaveLength(1);
  });

  test('signing out another sign-in removes it', async () => {
    const { host, calls } = await render(createElement(CloudAccount), handler());
    await act(async () => { host.querySelector<HTMLButtonElement>('button[data-session="bbbbbbbbbbbbbbbb"]')!.click(); });
    expect(calls.some((call) => call.url === '/api/account/sessions/bbbbbbbbbbbbbbbb' && call.init?.method === 'DELETE')).toBe(true);
    expect(host.querySelectorAll('button[data-session]')).toHaveLength(0);
  });

  test('deleting the account waits for the login to be typed, then leaves for the landing', async () => {
    const assign = vi.spyOn(location, 'assign').mockImplementation(() => {});
    const { calls } = await render(createElement(CloudAccount), handler());
    await clickText('Delete account…');
    const confirm = () => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((node) => node.textContent?.trim() === 'Delete account')!;
    expect(confirm().disabled).toBe(true);
    const input = document.querySelector<HTMLInputElement>('input[name="confirm-login"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'innei');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(confirm().disabled).toBe(false);
    await act(async () => { confirm().click(); });
    await act(async () => {});
    const sent = calls.find((call) => call.url === '/api/account' && call.init?.method === 'DELETE')!;
    expect(JSON.parse(String(sent.init!.body))).toEqual({ confirm: 'innei' });
    expect(assign).toHaveBeenCalledWith('/home');
  });

  test('a refusal is shown in the dialog', async () => {
    await render(createElement(CloudAccount), handler(409));
    await clickText('Delete account…');
    const input = document.querySelector<HTMLInputElement>('input[name="confirm-login"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'innei');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickText('Delete account');
    await act(async () => {});
    expect(document.body.textContent).toContain('Cancel Pro on the billing page first');
  });
});

describe('profile and account routes', () => {
  test('a single path segment on the cloud host is a profile, /u/ too', () => {
    expect(parseRoute('/innei', true)).toEqual({ kind: 'cloud-profile', login: 'innei' });
    expect(parseRoute('/u/billing', true)).toEqual({ kind: 'cloud-profile', login: 'billing' });
    expect(parseRoute('/account', true)).toEqual({ kind: 'cloud-account' });
    expect(parseRoute('/overview', true)).toEqual({ kind: 'cloud-overview' });
    expect(parseRoute('/innei', false)).toEqual({ kind: 'unknown' });
  });
});
