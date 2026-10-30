import { vi } from 'vitest';

// happy-dom has no Canvas 2D font shaping. Layout decisions have independent
// boundary tests; font measurements and rendering are checked in a real browser.
vi.mock('@chenglou/pretext', () => ({
  clearCache() {},
  prepare: (text: string) => text,
  measureNaturalWidth: (text: string) => text.length * 8,
}));
