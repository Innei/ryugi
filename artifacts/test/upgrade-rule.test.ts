import { expect, test } from 'vitest';

import { replaceDecision } from '../src/cli/upgrade-rule';

test('a newer release replaces the running server', () => {
  expect(replaceDecision('1.50.0', '1.51.0')).toBe('replace');
  expect(replaceDecision('1.50.9', '1.50.10')).toBe('replace');
});

test('an older release keeps the running server', () => {
  expect(replaceDecision('1.51.0', '1.50.0')).toBe('keep-older-cli');
});

test('the same release keeps the running server', () => {
  expect(replaceDecision('1.51.0', '1.51.0')).toBe('keep');
});

test('a rebuilt local build replaces a local build with another hash', () => {
  expect(replaceDecision('local-aaa', 'local-bbb')).toBe('replace');
  expect(replaceDecision('local-aaa', 'local-aaa')).toBe('keep');
});

test('a release never replaces a local build', () => {
  expect(replaceDecision('local-aaa', '1.60.0')).toBe('keep');
});

test('a local build replaces a release', () => {
  expect(replaceDecision('1.50.0', 'local-aaa')).toBe('replace');
});

test('an unknown running version is replaced, an unknown cli version is not', () => {
  expect(replaceDecision('', '1.50.0')).toBe('replace');
  expect(replaceDecision('1.50.0', '')).toBe('keep');
});
