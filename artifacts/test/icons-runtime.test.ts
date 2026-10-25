// @vitest-environment happy-dom
import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, expect, test } from 'vitest';

beforeAll(() => {
  new Function(fs.readFileSync(path.join(__dirname, '../dist/runtime/ryugi-icons.js'), 'utf8'))();
});

test('icons render without React or a UI theme and update when their name changes', () => {
  const theme = document.documentElement.dataset.theme;
  const icon = document.createElement('ryugi-icon');
  icon.setAttribute('name', 'message-square');
  document.body.append(icon);
  expect(icon.shadowRoot?.querySelector('svg')).toBeTruthy();
  const before = icon.shadowRoot!.querySelector('svg')!.innerHTML;
  icon.setAttribute('name', 'ellipsis');
  expect(icon.shadowRoot!.querySelector('svg')!.innerHTML).not.toBe(before);
  expect(document.documentElement.dataset.theme).toBe(theme);
  expect(document.querySelector('[data-ryugi-root]')).toBeNull();
});

test('decorative icons are hidden from assistive tech and labeled icons expose a name', () => {
  const icon = document.createElement('ryugi-icon');
  icon.setAttribute('name', 'copy');
  document.body.append(icon);
  expect(icon.getAttribute('aria-hidden')).toBe('true');
  icon.setAttribute('aria-label', 'Copy');
  expect(icon.getAttribute('role')).toBe('img');
  expect(icon.hasAttribute('aria-hidden')).toBe(false);
});
