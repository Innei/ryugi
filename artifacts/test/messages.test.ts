import { expect, test } from 'vitest';
import { translator } from '../src/shared/messages';

const dictionaries = {
  en: { page: { title: 'Signed in as {{login}}', only: 'English only' } },
  zh: { page: { title: '已登录 {{login}}' } },
};

test('looks up nested keys in the requested language', () => {
  expect(translator(dictionaries, 'zh')('page.title', { login: 'innei' })).toBe('已登录 innei');
  expect(translator(dictionaries, 'en')('page.title', { login: 'innei' })).toBe(
    'Signed in as innei',
  );
});

test('falls back to English, then to the key', () => {
  expect(translator(dictionaries, 'zh')('page.only')).toBe('English only');
  expect(translator(dictionaries, 'zh')('page.missing')).toBe('page.missing');
});

test('leaves unknown placeholders in place', () => {
  expect(translator(dictionaries, 'en')('page.title')).toBe('Signed in as {{login}}');
});

test('picks the plural form from count', () => {
  const plural = {
    en: { items_one: '{{count}} item', items_other: '{{count}} items' },
    zh: { items_other: '{{count}} 项' },
  };
  expect(translator(plural, 'en')('items', { count: 1 })).toBe('1 item');
  expect(translator(plural, 'en')('items', { count: 3 })).toBe('3 items');
  expect(translator(plural, 'zh')('items', { count: 1 })).toBe('1 项');
});
