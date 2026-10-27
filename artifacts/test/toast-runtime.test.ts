// @vitest-environment happy-dom
import { type ToastAPI, type ToastInstance } from '@lobehub/ui';
import { act } from 'react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

type Toast = Pick<ToastAPI, 'success' | 'error' | 'info' | 'warning' | 'loading' | 'dismiss'>;
const api = () => (window as Window & { ryugiToast?: Toast }).ryugiToast;
const notifications = () =>
  document.querySelector('[data-ryugi-toast-root]')?.shadowRoot ?? document;
let startup: ToastInstance | undefined;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.addEventListener(
    'ryugi-ui:ready',
    () => {
      startup = api()?.info({ title: 'Ready to notify', duration: 0 });
    },
    { once: true },
  );
  await act(async () => {
    await import('../src/runtime/index');
  });
});

afterEach(async () => {
  await act(async () => api()?.dismiss());
  await vi.waitFor(() => expect(notifications().querySelector('[role="dialog"]')).toBeNull());
});

function toaster() {
  expect(api()).toBeDefined();
  return api()!;
}

test('notifications called at runtime readiness render even without any custom controls', () => {
  toaster();
  expect(startup?.id).toBeTypeOf('string');
  expect(notifications().querySelector('[role="dialog"]')?.textContent).toContain(
    'Ready to notify',
  );
});

test('a string message provides the notification dialog with an accessible name', async () => {
  const toast = toaster();
  await act(async () => {
    toast.info('Preview available');
  });
  const dialog = notifications().querySelector('[role="dialog"]')!;
  const label = dialog.getAttribute('aria-labelledby');
  expect(label).toBeTruthy();
  expect(notifications().getElementById(label!)?.textContent).toBe('Preview available');
  await act(async () => {
    toast.info({ description: 'Connection restored', duration: 0 });
  });
  const names = [...notifications().querySelectorAll('[role="dialog"]')].map(
    (el) => notifications().getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent,
  );
  expect(names).toContain('Connection restored');
});

test('success and error notifications render plain text and descriptions', async () => {
  const toast = toaster();
  await act(async () => {
    toast.success({ title: 'Saved <draft>', description: 'Your changes are safe.', duration: 0 });
    toast.error({ title: 'Save failed', description: 'Try again.', duration: 0 });
  });
  const messages = [...notifications().querySelectorAll('[role="dialog"]')].map(
    (el) => el.textContent,
  );
  expect(
    messages.some(
      (message) => message?.includes('Saved <draft>') && message.includes('Your changes are safe.'),
    ),
  ).toBe(true);
  expect(
    messages.some((message) => message?.includes('Save failed') && message.includes('Try again.')),
  ).toBe(true);
  expect(notifications().querySelector('draft')).toBeNull();
});

test('a stable notification id refreshes one toast and its handle closes it', async () => {
  const toast = toaster();
  let handle: ToastInstance;
  await act(async () => {
    handle = toast.success({ id: 'save-result', title: 'Saved once', duration: 0 });
  });
  await act(async () => {
    toast.success({ id: 'save-result', title: 'Saved twice', duration: 0 });
  });
  expect(notifications().querySelectorAll('[role="dialog"]')).toHaveLength(1);
  expect(notifications().querySelector('[role="dialog"]')?.textContent).toContain('Saved twice');
  await act(async () => handle!.close());
  await vi.waitFor(() => expect(notifications().querySelector('[role="dialog"]')).toBeNull());
});

test('page typography cannot resize notification text or add paragraph margins', async () => {
  const pageStyle = document.createElement('style');
  pageStyle.textContent = 'h2,p { font-size:80px; margin:88px; }';
  document.head.append(pageStyle);
  try {
    await act(async () => {
      toaster().success({ title: 'Saved', description: 'Changes are safe.', duration: 0 });
    });
    const text = notifications().querySelectorAll('h2,p');
    expect(text.length).toBeGreaterThan(0);
    for (const el of text) {
      expect(getComputedStyle(el).fontSize).not.toBe('80px');
      expect(getComputedStyle(el).marginBottom).not.toBe('88px');
    }
  } finally {
    pageStyle.remove();
  }
});
