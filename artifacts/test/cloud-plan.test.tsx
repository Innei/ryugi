// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { CloudPlanUsage } from '../src/viewer/components/CloudPlanUsage';
import { PlanLimitDialog } from '../src/viewer/components/PlanLimitDialog';
import { changeVisibility, CloudRequestError, planLimitMessage } from '../src/viewer/lib/cloud-shell';

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function render(body: unknown, status = 200) {
  act(() => root?.unmount());
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(CloudPlanUsage)));
  await act(async () => {});
  return host;
}

const FREE = {
  plan: 'free',
  comped: false,
  usage: { private: 4, public: 10, total: 14, publishesToday: 3, viewsThisMonth: 10 },
  limits: { private: 5, public: 10, total: null, publishesPerDay: 20, viewsPerMonth: 3000 },
  subscription: null,
};

describe('CloudPlanUsage', () => {
  test('a free account sees its private and public counts and a way to upgrade', async () => {
    const host = await render(FREE);
    expect(host.textContent).toContain('Free');
    expect(host.textContent).toContain('Private 4/5');
    expect(host.textContent).toContain('Public 10/10');
    const full = Array.from(host.querySelectorAll('.cloud-plan-count')).find((node) => node.textContent === 'Public 10/10');
    expect(full?.classList.contains('is-full')).toBe(true);
    expect(host.querySelector<HTMLAnchorElement>('a[href="/billing"]')?.textContent).toBe('Upgrade to Pro');
  });

  test('the pill turns amber once any free count is full, and stays calm otherwise', async () => {
    expect((await render(FREE)).querySelector('.cloud-plan')?.classList.contains('is-tight')).toBe(true);
    const calm = await render({ ...FREE, usage: { ...FREE.usage, public: 3, private: 1 } });
    expect(calm.querySelector('.cloud-plan')?.classList.contains('is-tight')).toBe(false);
  });

  test('a Pro account sees one combined count and links to its plan page', async () => {
    const host = await render({ ...FREE, plan: 'pro', usage: { ...FREE.usage, total: 160 }, limits: { private: null, public: null, total: 500, publishesPerDay: null, viewsPerMonth: 100000 } });
    expect(host.textContent).toContain('Pro');
    expect(host.textContent).toContain('160/500');
    expect(host.querySelector<HTMLAnchorElement>('a[href="/billing"]')?.textContent).toBe('Plans');
  });

  test('shows nothing when the plan cannot be read', async () => {
    expect((await render({ artifacts: [] })).textContent).toBe('');
    expect((await render({ error: 'x' }, 500)).textContent).toBe('');
  });
});

describe('plan limit refusals', () => {
  test('a refused visibility change carries the limit and the upgrade link', async () => {
    const refusal = { error: 'The free plan allows 10 public artifacts and you have 10.', code: 'plan_limit', plan: 'free', limit: { kind: 'public', used: 10, max: 10 }, upgradeUrl: 'https://ryugi.innei.dev/billing' };
    const error = await changeVisibility('a1', 'public', (async () => new Response(JSON.stringify(refusal), { status: 402 })) as typeof fetch).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(CloudRequestError);
    expect(error).toMatchObject({ status: 402, upgradeUrl: 'https://ryugi.innei.dev/billing', limit: { kind: 'public', max: 10 } });
    expect(planLimitMessage((error as CloudRequestError).limit!)).toBe('All 10 public slots on the free plan are used.');
  });

  test('describes each kind of limit in Chinese', () => {
    expect(planLimitMessage({ kind: 'private', used: 5, max: 5 })).toBe('All 5 private slots on the free plan are used.');
    expect(planLimitMessage({ kind: 'total', used: 500, max: 500 })).toBe('All 500 Pro slots are used. Delete some and try again.');
    expect(planLimitMessage({ kind: 'publishes', used: 20, max: 20 })).toBe("You've used today's 20 publishes on the free plan.");
  });
});

describe('PlanLimitDialog', () => {
  async function dialog(props: Parameters<typeof PlanLimitDialog>[0]) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root!.render(createElement(PlanLimitDialog, props)));
    return host;
  }

  test('a full public quota keeps the artifact private and offers Pro, tidying up, or leaving it', async () => {
    const onClose = vi.fn();
    const host = await dialog({ limit: { kind: 'public', used: 10, max: 10 }, title: '发布会海报', upgradeUrl: 'https://ryugi.innei.dev/billing', onClose });
    expect(host.querySelector('h2')?.textContent).toBe('Public slots are full');
    expect(host.textContent).toContain('“发布会海报” stays private');
    expect(host.textContent).toContain('10 / 10');
    expect(host.querySelectorAll('.plan-limit-slot')).toHaveLength(10);
    const links = Array.from(host.querySelectorAll('a')).map((a) => [a.getAttribute('href'), a.textContent]);
    expect(links).toEqual([
      ['https://ryugi.innei.dev/billing', 'Upgrade to Pro$5 / month · 500 slots'],
      ['/?visibility=public', 'Tidy up public artifacts'],
    ]);
    const stay = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Keep it private')!;
    act(() => stay.click());
    expect(onClose).toHaveBeenCalledOnce();
  });

  test('a full private quota keeps the artifact public', async () => {
    const host = await dialog({ limit: { kind: 'private', used: 5, max: 5 }, title: null, upgradeUrl: '/billing', onClose: () => {} });
    expect(host.querySelector('h2')?.textContent).toBe('Private slots are full');
    expect(host.textContent).toContain('“this artifact” stays public');
    expect(host.querySelectorAll('.plan-limit-slot')).toHaveLength(5);
    expect(host.textContent).toContain('Keep it public');
  });
});
