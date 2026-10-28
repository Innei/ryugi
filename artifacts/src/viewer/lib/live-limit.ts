export const LIVE_LIMIT_MIN = 8;
export const LIVE_LIMIT_MAX = 32;
export const DEFAULT_LIVE_LIMIT = 24;
export const REFERENCE_VIEWPORT = { width: 1440, height: 900 } as const;

export interface DeviceProfile {
  cores?: number;
  memoryGB?: number;
}

export interface LiveLimitInput {
  device?: DeviceProfile;
  viewport: { width: number; height: number };
}

/**
 * How many live board frames the viewer may mount.
 *
 * Measured on the real viewer (headless Chrome, DPR 1): a static board costs
 * ~0.3 MB of JS heap and ~0.02 s of main-thread time to mount, then no idle
 * CPU; a 32-frame page holds ~10 MB of heap and ~0.8 s of task time. Raster
 * surfaces are 2-4 MB per frame at DPR 1, so Retina screens are the upper
 * bound. The old fixed 8 assumed 50-80 MB per frame, which is not what the
 * snapshots-and-tiers viewer does.
 *
 * The budget scales with the screen (a larger viewport keeps more boards
 * mostly visible) and with the device (low-memory or few-core machines keep
 * the old conservative 8).
 */
export function liveLimit({ device = {}, viewport }: LiveLimitInput): number {
  const { cores, memoryGB } = device;
  const screen = Math.min(
    Math.max(
      (viewport.width * viewport.height) / (REFERENCE_VIEWPORT.width * REFERENCE_VIEWPORT.height),
      0.75,
    ),
    1.75,
  );
  const memoryFactor = memoryGB !== undefined && memoryGB <= 4 ? 0.5 : 1;
  const coreFactor = cores !== undefined && cores <= 4 ? 0.7 : 1;
  const powerFactor = cores !== undefined && cores >= 12 ? 1.2 : 1;
  return Math.min(
    Math.max(
      Math.round(DEFAULT_LIVE_LIMIT * screen * memoryFactor * coreFactor * powerFactor),
      LIVE_LIMIT_MIN,
    ),
    LIVE_LIMIT_MAX,
  );
}
