import { expect, test } from 'vitest';
import { translator } from '../src/shared/messages';

const dictionaries = {
  en: { page: { title: 'Signed in as {{login}}', only: 'English only' } },
  zh: { page: { title: '已登录 {{login}}' } },
};

test('looks up nested keys in the requested language', () => {
  expect(translator(dictionaries, 'zh')('page.title', { login: 'innei' })).toBe('已登录 innei');
  expect(translator(dictionaries, 'en')('page.title', { login: 'innei' })).toBe('Signed in as innei');
});

test('falls back to English, then to the key', () => {
  expect(translator(dictionaries, 'zh')('page.only')).toBe('English only');
  expect(translator(dictionaries, 'zh')('page.missing')).toBe('page.missing');
});

test('leaves unknown placeholders in place', () => {
  expect(translator(dictionaries, 'en')('page.title')).toBe('Signed in as {{login}}');
});
