import { expect, test } from 'vitest';

import { parseAcceptLanguage, resolveLocale } from '../src/shared/locale';

test('picks Chinese for any zh preference', () => {
  expect(resolveLocale(['zh-CN'])).toBe('zh');
  expect(resolveLocale(['zh-TW', 'en'])).toBe('zh');
  expect(resolveLocale(['ZH'])).toBe('zh');
});

test('the first zh or en entry wins', () => {
  expect(resolveLocale(['fr', 'en-GB', 'zh'])).toBe('en');
  expect(resolveLocale(['ja', 'zh-HK', 'en'])).toBe('zh');
});

test('falls back to English', () => {
  expect(resolveLocale([])).toBe('en');
  expect(resolveLocale(['de', 'ja'])).toBe('en');
});

test('orders Accept-Language by q-value', () => {
  expect(parseAcceptLanguage('en;q=0.5, zh-CN;q=0.9, *;q=0.1')).toEqual(['zh-CN', 'en', '*']);
  expect(parseAcceptLanguage('zh-CN,zh;q=0.9,en;q=0.8')).toEqual(['zh-CN', 'zh', 'en']);
  expect(parseAcceptLanguage(undefined)).toEqual([]);
  expect(parseAcceptLanguage('')).toEqual([]);
});

test('resolves an Accept-Language header', () => {
  expect(resolveLocale(parseAcceptLanguage('zh-CN,zh;q=0.9,en;q=0.8'))).toBe('zh');
  expect(resolveLocale(parseAcceptLanguage('en-US,en;q=0.9,zh;q=0.8'))).toBe('en');
});
