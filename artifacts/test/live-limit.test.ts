import { expect, test } from 'vitest';

import {
  DEFAULT_LIVE_LIMIT,
  type DeviceProfile,
  LIVE_LIMIT_MAX,
  LIVE_LIMIT_MIN,
  liveLimit,
  REFERENCE_VIEWPORT,
} from '../src/viewer/lib/live-limit';

const at = (device?: DeviceProfile) => liveLimit({ viewport: REFERENCE_VIEWPORT, device });

test('the reference desktop keeps the default budget', () => {
  expect(at()).toBe(DEFAULT_LIVE_LIMIT);
  expect(at({ cores: 8, memoryGB: 8 })).toBe(24);
});

test('a bigger screen keeps more live boards, capped at the ceiling', () => {
  expect(liveLimit({ viewport: { width: 3840, height: 2160 } })).toBe(LIVE_LIMIT_MAX);
  expect(liveLimit({ viewport: { width: 1536, height: 960 } })).toBe(27);
  expect(liveLimit({ viewport: { width: 1280, height: 800 } })).toBe(19);
});

test('a small screen never goes below the floor or the old conservative budget', () => {
  expect(liveLimit({ viewport: { width: 800, height: 600 } })).toBe(18);
  expect(liveLimit({ viewport: { width: 320, height: 240 } })).toBe(18);
});

test('low memory and few cores keep the old conservative budget', () => {
  expect(at({ cores: 4, memoryGB: 4 })).toBe(LIVE_LIMIT_MIN);
  expect(at({ cores: 4, memoryGB: 8 })).toBe(17);
  expect(at({ cores: 8, memoryGB: 4 })).toBe(12);
});

test('many cores raise the budget', () => {
  expect(at({ cores: 16, memoryGB: 8 })).toBe(29);
});
