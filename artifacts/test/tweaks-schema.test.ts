import { expect, test } from 'vitest';

import { readTweakSchema, readTweakValues, reconcileTweakValues } from '../src/shared/tweaks';

function schema(controls: Record<string, unknown>) {
  return readTweakSchema({ version: 1, controls });
}

test('normalizes human labels/options and preserves typed defaults, including zero and false', () => {
  const result = schema({
    count: { type: 'range', default: 0, min: 0, max: 4 },
    enabled: { type: 'boolean', default: false },
    density: {
      type: 'enum',
      default: 'compact',
      options: [{ value: 'compact', label: '紧凑' }, 'comfortable'],
    },
  });
  expect(result.error).toBeNull();
  expect(reconcileTweakValues(result.schema!)).toEqual({
    count: 0,
    enabled: false,
    density: 'compact',
  });
  expect(result.schema!.controls.density!.options).toEqual([
    { value: 'compact', label: '紧凑' },
    { value: 'comfortable', label: 'comfortable' },
  ]);
});

test.each([
  { type: 'range', min: 0, max: 4, default: 7 },
  { type: 'range', min: 0, max: 4, step: 0, default: 2 },
  { type: 'range', min: 0, max: 4, step: 2, default: 1 },
  { type: 'number', default: Infinity },
  { type: 'number', min: 10, max: 1, default: 2 },
  { type: 'enum', default: 'missing', options: ['a'] },
  { type: 'enum', default: 'a', options: ['a', 'a'] },
  { type: 'color', default: 'url(https://example.com)' },
  { type: 'boolean', default: 'false' },
  { type: 'text', default: 'x'.repeat(513) },
  { type: 'script', default: 'alert(1)' },
])('rejects invalid control declarations before exposing a panel: %j', (control) => {
  const result = schema({ test: control });
  expect(result.schema).toBeNull();
  expect(result.error).toMatch(/test/);
});

test('rejects unsafe keys and excessive controls without polluting prototypes', () => {
  expect(schema(JSON.parse('{"__proto__":{"type":"text","default":"bad"}}')).error).toBeTruthy();
  expect(schema({ constructor: { type: 'text', default: 'bad' } }).error).toBeTruthy();
  expect(
    schema(
      Object.fromEntries(
        Array.from({ length: 33 }, (_, i) => ['key' + i, { type: 'boolean', default: false }]),
      ),
    ).error,
  ).toBeTruthy();
  expect(({} as any).bad).toBeUndefined();
});

test('accepts complete valid values but rejects invalid types, bounds, steps and unknown fields', () => {
  const s = schema({
    count: { type: 'range', default: 0, min: 0, max: 4, step: 2 },
    enabled: { type: 'boolean', default: false },
  }).schema!;
  expect(readTweakValues(s, { count: 4, enabled: true })).toEqual({ count: 4, enabled: true });
  for (const values of [
    { count: '4', enabled: true },
    { count: 1, enabled: true },
    { count: 6, enabled: true },
    { count: 2, enabled: 'true' },
    { count: 2 },
    { count: 2, enabled: true, foreign: 1 },
  ])
    expect(readTweakValues(s, values)).toBeNull();
});

test('rejects keys that would collide in case-insensitive HTML data attributes', () => {
  const result = schema({
    density: { type: 'text', default: 'comfortable' },
    Density: { type: 'text', default: 'compact' },
  });
  expect(result.schema).toBeNull();
  expect(result.error).toMatch(/key|case|duplicate/i);
});

test('source refresh follows untouched defaults, preserves valid overrides and drops invalid or removed overrides', () => {
  const before = schema({
    count: { type: 'range', default: 2, min: 0, max: 8 },
    theme: { type: 'enum', default: 'light', options: ['light', 'dark'] },
    removed: { type: 'text', default: 'old' },
  }).schema!;
  const after = schema({
    count: { type: 'range', default: 3, min: 0, max: 4 },
    theme: { type: 'enum', default: 'dark', options: ['light', 'dark'] },
    fresh: { type: 'boolean', default: false },
  }).schema!;
  expect(
    reconcileTweakValues(after, { count: 4, theme: 'light', removed: 'edited' }, before),
  ).toEqual({ count: 4, theme: 'dark', fresh: false });
  expect(reconcileTweakValues(after, { count: 8, theme: 'dark' }, before)).toEqual({
    count: 3,
    theme: 'dark',
    fresh: false,
  });
});
