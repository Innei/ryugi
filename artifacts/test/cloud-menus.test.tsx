// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { closeContextMenu, ConfigProvider, ContextMenuHost, ModalHost, toast, ToastHost } from '@lobehub/ui';
import { motion, MotionGlobalConfig } from 'motion/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { CloudListItem } from '../src/viewer/lib/cloud-list';
import { CloudArtifactList } from '../src/viewer/layouts/CloudArtifactList';
import { CloudDashboard } from '../src/viewer/layouts/CloudDashboard';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}) }));
vi.mock('../src/viewer/components/ArtifactThumbnail', () => ({ ArtifactThumbnail: () => createElement('div') }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

const item = (id: string, project: string | null, extra: Partial<CloudListItem> = {}): CloudListItem => ({
  id, project, updatedAt: '2026-10-21T08:00:00Z', type: 'html', title: id, visibility: 'private', url: `https://ryugi.innei.dev/a/${id}`, version: 1, ...extra,
});
const ARTIFACTS = [
  item('a', 'ryugi', { title: 'Arrow', visibility: 'public', onProfile: true, updatedAt: '2026-10-21T09:00:00Z' }),
  item('b', 'ryugi', { title: 'Notes' }),
  item('c', null, { title: 'Loose', updatedAt: '2026-10-21T07:00:00Z' }),
];

type Call = { url: string; method: string; body: unknown };
type Handler = (url: string, init?: RequestInit) => Response | undefined;

let root: Root | null = null;
const startAddress = location.href;

beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
});

afterEach(async () => {
  await act(async () => { closeContextMenu(); toast.dismiss(); });
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  history.replaceState(null, '', startAddress);
  try { localStorage.clear(); } catch {}
});

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); });
}

async function render(artifacts: CloudListItem[] = ARTIFACTS, handler: Handler = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method !== 'GET') calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    const custom = handler(url, init);
    if (custom) return custom;
    if (url === '/api/account/artifacts') return Response.json({ login: 'innei', profilePath: '/innei', artifacts });
    if (url === '/api/session') return Response.json({ login: 'innei' });
    if (method === 'PATCH') return Response.json({ visibility: (JSON.parse(String(init!.body)) as { visibility: string }).visibility });
    if (method === 'PUT') return Response.json({ ok: true });
    if (method === 'DELETE') return new Response(null, { status: 204 });
    return Response.json(null, { status: 404 });
  }));
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const page = createElement(CloudDashboard, { active: 'artifacts', wide: true, children: createElement(CloudArtifactList) });
  await act(async () => root!.render(createElement(ConfigProvider, { motion, enableCustomFonts: false, children: [
    createElement('div', { key: 'page' }, page), createElement(ModalHost, { key: 'modal' }), createElement(ToastHost, { key: 'toast' }), createElement(ContextMenuHost, { key: 'menu' }),
  ] })));
  await settle();
  return { host, calls };
}

const rowItem = (host: HTMLElement, title: string) => Array.from(host.querySelectorAll<HTMLElement>('.cloud-row-item')).find((node) => node.querySelector('.cloud-row-title')?.textContent === title);
const sideButton = (host: HTMLElement, label: string) => Array.from(host.querySelectorAll<HTMLElement>('.cloud-side-button')).find((node) => node.querySelector('.cloud-side-label')?.textContent === label)!;
const menuEntries = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemcheckbox"]'));
const menuLabels = () => menuEntries().map((node) => node.textContent?.trim());
const entry = (label: string) => {
  const found = menuEntries().find((node) => node.textContent?.trim().startsWith(label));
  expect(found, `menu entry ${label}`).toBeDefined();
  return found!;
};

async function rightClick(node: HTMLElement) {
  await act(async () => { node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 200 })); });
  await settle();
}

async function pick(label: string) {
  await act(async () => { entry(label).click(); });
  await settle();
}

async function clickButton(text: string, parent: ParentNode = document) {
  const button = Array.from(parent.querySelectorAll<HTMLElement>('button')).find((node) => node.textContent?.trim() === text);
  expect(button, `button ${text}`).toBeDefined();
  await act(async () => { button!.click(); });
  await settle();
}

describe('artifact row menu', () => {
  test('right-clicking a row opens its menu and marks the row until the menu closes, leaving the inspector alone', async () => {
    const { host } = await render();
    await rightClick(rowItem(host, 'Notes')!.querySelector('.cloud-row')!);
    expect(menuLabels()).toEqual(['Open', 'Open in new tab', 'Copy link', 'Who can see', 'Show on your profile', 'Select', 'Delete…']);
    expect(rowItem(host, 'Notes')!.classList.contains('is-menu-open')).toBe(true);
    expect(host.querySelector('section[aria-label="Details"] h2')?.textContent).toBe('Arrow');
    await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await settle();
    expect(menuEntries()).toHaveLength(0);
    expect(rowItem(host, 'Notes')!.classList.contains('is-menu-open')).toBe(false);
  });

  test('picking an entry closes the menu and clears the mark', async () => {
    const { host } = await render();
    await rightClick(rowItem(host, 'Notes')!.querySelector('.cloud-row')!);
    await pick('Select');
    expect(menuEntries()).toHaveLength(0);
    expect(rowItem(host, 'Notes')!.classList.contains('is-menu-open')).toBe(false);
  });

  test('a private artifact cannot be listed on the profile from the menu', async () => {
    const { host } = await render();
    await rightClick(rowItem(host, 'Notes')!.querySelector('.cloud-row')!);
    expect(entry('Show on your profile').getAttribute('aria-disabled') ?? entry('Show on your profile').getAttribute('data-disabled')).not.toBeNull();
  });

  test('who can see is chosen from a submenu and updates the row', async () => {
    const { host, calls } = await render();
    await rightClick(rowItem(host, 'Notes')!.querySelector('.cloud-row')!);
    await pick('Who can see');
    expect(menuLabels()).toContain('Anyone with the link');
    await pick('Anyone with the link');
    expect(calls).toEqual([{ url: '/api/a/b', method: 'PATCH', body: { visibility: 'public' } }]);
    expect(rowItem(host, 'Notes')!.querySelector('.cloud-visibility')?.textContent).toBe('Has link');
  });

  test('a full public quota opens the plan dialog and keeps the row private', async () => {
    const { host } = await render(ARTIFACTS, (_url, init) => init?.method === 'PATCH'
      ? Response.json({ error: 'full', code: 'plan_limit', limit: { kind: 'public', used: 10, max: 10 }, upgradeUrl: '/billing' }, { status: 402 })
      : undefined);
    await rightClick(rowItem(host, 'Notes')!.querySelector('.cloud-row')!);
    await pick('Who can see');
    await pick('Anyone with the link');
    expect(rowItem(host, 'Notes')!.querySelector('.cloud-visibility')?.textContent).toBe('Only me');
    expect(document.querySelector('a[href="/billing"]')).not.toBeNull();
    await act(async () => { document.querySelector<HTMLElement>('.plan-limit-stay')!.click(); });
    await settle();
  });

  test('showing on the profile is a checkbox for public artifacts', async () => {
    const { host, calls } = await render();
    await rightClick(rowItem(host, 'Arrow')!.querySelector('.cloud-row')!);
    expect(entry('Show on your profile').getAttribute('aria-checked')).toBe('true');
    await pick('Show on your profile');
    expect(calls).toEqual([{ url: '/api/a/a/profile', method: 'PUT', body: { shown: false } }]);
  });

  test('copy link puts the share link on the clipboard and says so', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { host } = await render();
    await rightClick(rowItem(host, 'Notes')!.querySelector('.cloud-row')!);
    await pick('Copy link');
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/a/b`);
    expect(document.body.textContent).toContain('Link copied');
  });

  test('open in new tab opens the artifact without leaving the list', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { host } = await render();
    await rightClick(rowItem(host, 'Notes')!.querySelector('.cloud-row')!);
    await pick('Open in new tab');
    expect(open).toHaveBeenCalledWith('/a/b', '_blank', 'noopener');
  });

  test('select starts selecting with that row picked', async () => {
    const { host } = await render();
    await rightClick(rowItem(host, 'Notes')!.querySelector('.cloud-row')!);
    await pick('Select');
    expect(host.querySelector('[role="checkbox"][aria-label="Select Notes"]')?.getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.cloud-selection-bar')?.textContent).toContain('1 selected');
  });

  test('delete asks to confirm that one artifact', async () => {
    const { host } = await render();
    await rightClick(rowItem(host, 'Notes')!.querySelector('.cloud-row')!);
    await pick('Delete…');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Notes');
  });

  test('grid cards open the same menu', async () => {
    localStorage.setItem('ryugi-cloud-view', 'grid');
    const { host } = await render();
    const card = Array.from(host.querySelectorAll<HTMLElement>('.cloud-card-item')).find((node) => node.textContent?.includes('Notes'))!;
    await rightClick(card.querySelector('button')!);
    expect(menuLabels()).toContain('Who can see');
    expect(card.classList.contains('is-menu-open')).toBe(true);
  });
});

describe('project menu', () => {
  test('select all picks every artifact in the project and shows only that project', async () => {
    const { host } = await render();
    await rightClick(sideButton(host, 'ryugi'));
    expect(document.body.textContent).toContain('ryugi · 2 artifacts');
    expect(sideButton(host, 'ryugi').classList.contains('is-menu-open')).toBe(true);
    await pick('Select all 2');
    expect(new URLSearchParams(location.search).get('project')).toBe('ryugi');
    expect(host.querySelector('[role="checkbox"][aria-label="Select Arrow"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[role="checkbox"][aria-label="Select Notes"]')?.getAttribute('aria-checked')).toBe('true');
    expect(rowItem(host, 'Loose')).toBeUndefined();
  });

  test('show only filters to the project', async () => {
    const { host } = await render();
    await rightClick(sideButton(host, 'ryugi'));
    await pick('Show only ryugi');
    expect(rowItem(host, 'Loose')).toBeUndefined();
  });

  test('share all with link shares only the private ones and stops at the plan limit', async () => {
    const many = [...ARTIFACTS, item('d', 'ryugi', { title: 'Third' })];
    let patches = 0;
    const { host, calls } = await render(many, (_url, init) => {
      if (init?.method !== 'PATCH') return undefined;
      patches += 1;
      return patches === 1 ? Response.json({ visibility: 'public' }) : Response.json({ error: 'full', code: 'plan_limit', limit: { kind: 'public', used: 10, max: 10 }, upgradeUrl: '/billing' }, { status: 402 });
    });
    await rightClick(sideButton(host, 'ryugi'));
    await pick('Share all with link');
    expect(calls.map((call) => call.url)).toEqual(['/api/a/b', '/api/a/d']);
    expect(rowItem(host, 'Notes')!.querySelector('.cloud-visibility')?.textContent).toBe('Has link');
    expect(rowItem(host, 'Third')!.querySelector('.cloud-visibility')?.textContent).toBe('Only me');
    expect(document.body.textContent).toContain('Shared 1 of 2');
    expect(document.body.textContent).toContain('Upgrade');
  });

  test('make all only me turns off every link in the project', async () => {
    const { host, calls } = await render();
    await rightClick(sideButton(host, 'ryugi'));
    await pick('Make all only me');
    expect(calls).toEqual([{ url: '/api/a/a', method: 'PATCH', body: { visibility: 'private' } }]);
    expect(rowItem(host, 'Arrow')!.querySelector('.cloud-visibility')?.textContent).toBe('Only me');
    expect(document.body.textContent).toContain('Turned off the link for 1 artifact');
  });

  test('hide all from profile unlists the public ones that are listed', async () => {
    const { host, calls } = await render();
    await rightClick(sideButton(host, 'ryugi'));
    await pick('Hide all from profile');
    expect(calls).toEqual([{ url: '/api/a/a/profile', method: 'PUT', body: { shown: false } }]);
    expect(document.body.textContent).toContain('Hid 1 artifact from your profile');
  });

  test('delete asks to confirm every artifact in the project', async () => {
    const { host } = await render();
    await rightClick(sideButton(host, 'ryugi'));
    await pick('Delete 2 artifacts…');
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Arrow');
    expect(dialog.textContent).toContain('Notes');
  });
});

describe('no footer', () => {
  test('the list has no footer, and selecting shows a floating bar', async () => {
    const { host } = await render();
    expect(host.querySelector('.cloud-footer')).toBeNull();
    expect(document.querySelector('.cloud-selection-bar')).toBeNull();
    await act(async () => { host.querySelector<HTMLElement>('button[aria-label="Select multiple"]')!.click(); });
    const bar = document.querySelector<HTMLElement>('.cloud-selection-bar')!;
    expect(bar.textContent).toContain('0 selected');
    await clickButton('Cancel', bar);
    expect(document.querySelector('.cloud-selection-bar')).toBeNull();
  });

  test('a delete result is a toast', async () => {
    const { host } = await render();
    await rightClick(rowItem(host, 'Notes')!.querySelector('.cloud-row')!);
    await pick('Delete…');
    await clickButton('Delete 1 item', document.querySelector('[role="dialog"]')!);
    expect(document.body.textContent).toContain('Deleted 1 item');
  });
});
