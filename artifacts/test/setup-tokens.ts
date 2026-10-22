import { vi } from 'vitest';

vi.mock('../src/viewer/tokens.stylex', () => ({ brand: new Proxy({}, { get: (_, key) => `var(--brand-${String(key)})` }) }));
