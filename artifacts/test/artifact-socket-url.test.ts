import { expect, test } from 'vitest';

import { artifactSocketUrl } from '../src/viewer/hooks/useArtifactSocket';

test('the page socket names the page it was opened from', () => {
  expect(
    artifactSocketUrl({ protocol: 'http:', host: 'localhost:27319', pathname: '/artboard/abc' }),
  ).toBe('ws://localhost:27319/ws?at=%2Fartboard%2Fabc');
});

test('a secure page opens a secure socket', () => {
  expect(
    artifactSocketUrl({ protocol: 'https:', host: 'example.test', pathname: '/document/x y' }),
  ).toBe('wss://example.test/ws?at=%2Fdocument%2Fx%20y');
});
