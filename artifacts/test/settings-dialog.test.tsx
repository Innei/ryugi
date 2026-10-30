// @vitest-environment happy-dom
import { ConfigProvider } from '@lobehub/ui';
import { motion } from 'motion/react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import type { CloudStatus } from '../src/shared/cloud';
import { AccountMenuButton } from '../src/viewer/components/AccountMenu';
import { SettingsPanel } from '../src/viewer/components/SettingsDialog';
import { closeSettings, openSettings, settingsOpen } from '../src/viewer/lib/settings-dialog';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  closeSettings();
});

const status = (
  signedIn: boolean,
  global: boolean | null = true,
  project: boolean | null = null,
): CloudStatus => ({
  signedIn,
  login: signedIn ? 'innei' : null,
  origin: 'https://ryugi.innei.dev',
  artifacts: {},
  autoPublish: { global, project, enabled: signedIn && (project ?? global ?? false) },
  warning: null,
});

function mount(element: ReturnType<typeof createElement>) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      createElement(ConfigProvider, { enableCustomFonts: false, motion, children: element }),
    ),
  );
  return host;
}

const panel = (value: CloudStatus) => {
  const props = {
    status: value,
    project: 'ryugi',
    waitingForLogin: false,
    onAutoPublish: vi.fn(async () => {}),
    onSignIn: vi.fn(),
    onSignOut: vi.fn(async () => {}),
  };
  return { host: mount(createElement(SettingsPanel, props)), props };
};

const byText = (host: HTMLElement, text: string) =>
  [...host.querySelectorAll<HTMLElement>('button, [role="radio"], label')].find(
    (el) => el.textContent?.trim() === text,
  )!;

test('shows the account and the auto-publish switch when signed in', () => {
  const { host } = panel(status(true, true));
  expect(host.textContent).toContain('innei');
  const toggle = host.querySelector('[role="switch"]')!;
  expect(toggle.getAttribute('aria-checked')).toBe('true');
});

test('the switch sets the global value', async () => {
  const { host, props } = panel(status(true, true));
  await act(async () => host.querySelector<HTMLElement>('[role="switch"]')!.click());
  expect(props.onAutoPublish).toHaveBeenCalledWith({ scope: 'global', value: false });
});

test('the project choice sets or clears the project override', async () => {
  const { host, props } = panel(status(true, true));
  expect(host.textContent).toContain('ryugi');
  await act(async () => byText(host, 'Off').click());
  expect(props.onAutoPublish).toHaveBeenCalledWith({ scope: 'project', value: false });
});

test('signs out', async () => {
  const { host, props } = panel(status(true));
  await act(async () => byText(host, 'Sign out').click());
  expect(props.onSignOut).toHaveBeenCalled();
});

test('offers sign-in instead of the switch when signed out', async () => {
  const { host, props } = panel(status(false, null));
  expect(host.querySelector('[role="switch"]')).toBeNull();
  await act(async () => byText(host, 'Sign in with GitHub').click());
  expect(props.onSignIn).toHaveBeenCalled();
});

test('opening and closing settings is shared across components', () => {
  expect(settingsOpen()).toBe(false);
  openSettings();
  expect(settingsOpen()).toBe(true);
  closeSettings();
  expect(settingsOpen()).toBe(false);
});

test('the account button shows the avatar without the name when signed in', () => {
  const host = mount(createElement(AccountMenuButton, { status: status(true), onSignIn: vi.fn() }));
  const button = host.querySelector('button')!;
  expect(button.getAttribute('aria-label')).toContain('innei');
  expect(button.textContent).not.toContain('innei');
});

test('the account button signs in when signed out', async () => {
  const onSignIn = vi.fn();
  const host = mount(createElement(AccountMenuButton, { status: status(false, null), onSignIn }));
  await act(async () => byText(host, 'Sign in').click());
  expect(onSignIn).toHaveBeenCalled();
});
