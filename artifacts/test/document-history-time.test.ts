import { expect, test } from 'vitest';
import { historyClock, historyDay, historyWhen } from '../src/viewer/document/historyTime';

const now = new Date(2026, 9, 24, 15, 30).getTime();
const at = (...parts: [number, number, number, number, number, number?]) => new Date(...parts).getTime() / 1000;

test('timeline days read as today, yesterday, then dates', () => {
  expect(historyDay(at(2026, 9, 24, 0, 1), now)).toBe('今天');
  expect(historyDay(at(2026, 9, 23, 23, 59), now)).toBe('昨天');
  expect(historyDay(at(2026, 9, 2, 9, 0), now)).toBe('10月2日');
  expect(historyDay(at(2025, 11, 31, 9, 0), now)).toBe('2025年12月31日');
  expect(historyDay(0, now)).toBe('时间未记录');
});

test('clock times are zero padded and missing ones stay visible', () => {
  expect(historyClock(at(2026, 9, 24, 9, 5, 7))).toBe('09:05');
  expect(historyClock(at(2026, 9, 24, 9, 5, 7), true)).toBe('09:05:07');
  expect(historyClock(0)).toBe('--:--');
});

test('a change time combines its day and clock', () => {
  expect(historyWhen(Date.now() / 1000)).toMatch(/^今天 \d\d:\d\d$/);
  expect(historyWhen(0)).toBe('时间未记录');
});
