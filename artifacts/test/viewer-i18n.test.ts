import { expect, test } from 'vitest';
import en from '../src/viewer/i18n/locales/en.json';
import zh from '../src/viewer/i18n/locales/zh.json';
import { createViewerI18n } from '../src/viewer/i18n';

const PLURAL = /_(zero|one|two|few|many|other)$/;

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix.replace(PLURAL, '')];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

test('zh and en define the same keys', () => {
  expect([...new Set(keys(zh))].sort()).toEqual([...new Set(keys(en))].sort());
});

test('uses Chinese when the browser prefers it', () => {
  const zhI18n = createViewerI18n(['zh-CN', 'en']);
  const enI18n = createViewerI18n(['fr', 'en-US']);
  expect(zhI18n.language).toBe('zh');
  expect(enI18n.language).toBe('en');
  expect(zhI18n.t('common.share')).toBe(zh.common.share);
  expect(enI18n.t('common.share')).toBe(en.common.share);
});
