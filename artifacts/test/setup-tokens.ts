import { vi } from 'vitest';

vi.mock('../src/viewer/tokens.stylex', () => ({
  brand: new Proxy({}, { get: (_, key) => `var(--brand-${String(key)})` }),
  motion: new Proxy({}, { get: (_, key) => `var(--motion-${String(key)})` }),
  color: new Proxy({}, { get: (_, key) => `var(--color-${String(key)})` }),
}));
