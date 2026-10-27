import { expect, test } from 'vitest';
import en from '../src/server/locales/en.json';
import zh from '../src/server/locales/zh.json';
import { viewerPage } from '../src/server/viewer-page';

const keys = (value: unknown, prefix = ''): string[] =>
  typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([key, child]) =>
        keys(child, prefix ? `${prefix}.${key}` : key),
      )
    : [prefix];

test('zh and en server dictionaries define the same keys', () => {
  expect(keys(zh).sort()).toEqual(keys(en).sort());
});

test('the viewer page carries the request language', () => {
  const template =
    '<!doctype html><html lang="en"><head><title>x</title><meta property="og:locale" content="en_US"></head></html>';
  const zhPage = viewerPage(template, {
    title: 't',
    description: 'd',
    url: 'http://localhost/',
    locale: 'zh',
  });
  expect(zhPage).toContain('<html lang="zh-CN">');
  expect(zhPage).toContain('<meta property="og:locale" content="zh_CN">');
  const enPage = viewerPage(template, {
    title: 't',
    description: 'd',
    url: 'http://localhost/',
    locale: 'en',
  });
  expect(enPage).toContain('<html lang="en">');
  expect(enPage).toContain('<meta property="og:locale" content="en_US">');
});
