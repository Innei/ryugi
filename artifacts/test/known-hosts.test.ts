import { describe, expect, test } from 'vitest';
import { knownHosts, takeHostHint } from '../src/viewer/lib/knownHosts';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('known hosts', () => {
  test('a remembered host is known from then on, in this browser only', () => {
    const storage = memoryStorage();
    const known = knownHosts(storage);
    expect(known.has('mac')).toBe(false);
    known.remember('mac');
    expect(knownHosts(storage).has('mac')).toBe(true);
    expect(knownHosts(memoryStorage()).has('mac')).toBe(false);
  });

  test('unreadable storage knows nothing and never throws', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const known = knownHosts(broken);
    expect(() => known.remember('mac')).not.toThrow();
    expect(known.has('mac')).toBe(false);
    expect(knownHosts(null).has('mac')).toBe(false);
  });

  test('only the 20 most recent hosts are kept', () => {
    const storage = memoryStorage();
    const known = knownHosts(storage);
    for (let i = 0; i < 25; i++) known.remember(`host-${i}`);
    expect(known.has('host-4')).toBe(false);
    expect(known.has('host-5')).toBe(true);
    expect(known.has('host-24')).toBe(true);
  });
});

describe('the hint in the link', () => {
  test('a ryugi-host fragment is remembered and removed from the address', () => {
    const storage = memoryStorage();
    const known = knownHosts(storage);
    expect(takeHostHint('#ryugi-host=abcdefghijklmnop1234', known)).toBe('');
    expect(known.has('abcdefghijklmnop1234')).toBe(true);
  });

  test('anything else in the fragment is left alone', () => {
    const known = knownHosts(memoryStorage());
    expect(takeHostHint('#section-2', known)).toBeNull();
    expect(takeHostHint('', known)).toBeNull();
    expect(takeHostHint('#ryugi-host=bad id!', known)).toBeNull();
  });
});
