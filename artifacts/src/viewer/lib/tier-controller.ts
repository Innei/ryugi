import { chooseTiers, type BoardTier, type TierInput } from './board-tiers';

export interface ControllerInput extends TierInput {
  scaling: boolean;
  hovered: string | null;
  hoverPromotes: boolean;
  warm?: readonly string[];
}
export interface BoardState { tier: BoardTier; mounted: boolean; ready: boolean; warming?: boolean }

const LINGER_MS = 1500;
const MAX_MOUNTING = 2;
const MAX_WARMING = 2;
const READY_AFTER_LOAD_MS = 3000;
const MOUNT_TIMEOUT_MS = 8000;

interface Clock {
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => number;
  cancel?: (id: number) => void;
  onChange: () => void;
  onGiveUp?: (id: string) => void;
}

export function createTierController({
  now = () => performance.now(),
  schedule = (fn, ms) => window.setTimeout(fn, ms),
  cancel = (id) => window.clearTimeout(id),
  onChange,
  onGiveUp,
}: Clock) {
  const frames = new Map<string, { ready: boolean; timer?: number }>();
  const wantedAt = new Map<string, number>();
  const lingering = new Map<string, number>();
  let live = new Set<string>();

  const markReady = (id: string) => {
    const frame = frames.get(id);
    if (!frame || frame.ready) return;
    frame.ready = true;
    if (frame.timer !== undefined) cancel(frame.timer);
    frame.timer = undefined;
    onChange();
  };
  const release = (id: string) => {
    const frame = frames.get(id);
    if (frame?.timer !== undefined) cancel(frame.timer);
    frames.delete(id);
  };
  const settle = (id: string) => {
    if (live.has(id)) return markReady(id);
    if (!frames.has(id)) return;
    release(id);
    onGiveUp?.(id);
    onChange();
  };

  return {
    loaded(id: string) {
      const frame = frames.get(id);
      if (!frame || frame.ready) return;
      if (frame.timer !== undefined) cancel(frame.timer);
      frame.timer = schedule(() => settle(id), READY_AFTER_LOAD_MS);
    },
    ready: markReady,
    update(input: ControllerInput): Map<string, BoardState> {
      const time = now();
      const ids = new Set(input.boards.map((board) => board.id));
      for (const id of [...frames.keys()]) if (!ids.has(id)) release(id);
      const pinned = input.pinned;
      const first = (id: string) => pinned.has(id) || (input.hoverPromotes && id === input.hovered);
      const tiers = chooseTiers({ ...input, hovered: input.hoverPromotes ? input.hovered : null });

      if (!input.scaling) {
        const next = new Set<string>();
        for (const [id, tier] of tiers) {
          if (tier !== 'live') continue;
          wantedAt.set(id, time);
          next.add(id);
        }
        for (const id of live) {
          if (next.has(id) || !ids.has(id)) continue;
          const since = time - (wantedAt.get(id) ?? -Infinity);
          if (since >= LINGER_MS) continue;
          next.add(id);
          if (!lingering.has(id)) lingering.set(id, schedule(() => { lingering.delete(id); onChange(); }, LINGER_MS - since));
        }
        live = next;
        const warm = (input.warm ?? []).filter((id) => ids.has(id) && !live.has(id));
        const wanted = new Set(warm);
        for (const id of [...frames.keys()]) if (!live.has(id) && !wanted.has(id)) release(id);
        let mounting = [...frames.values()].filter((frame) => !frame.ready).length;
        const waiting = input.boards.map((board) => board.id).filter((id) => live.has(id) && !frames.has(id)).sort((a, b) => Number(first(b)) - Number(first(a)));
        for (const id of waiting) {
          if (mounting >= MAX_MOUNTING) break;
          const frame: { ready: boolean; timer?: number } = { ready: false };
          frames.set(id, frame);
          frame.timer = schedule(() => markReady(id), MOUNT_TIMEOUT_MS);
          mounting++;
        }
        let warming = [...frames.keys()].filter((id) => !live.has(id)).length;
        for (const id of warm) {
          if (mounting >= MAX_MOUNTING || warming >= MAX_WARMING) break;
          if (frames.has(id)) continue;
          const frame: { ready: boolean; timer?: number } = { ready: false };
          frames.set(id, frame);
          frame.timer = schedule(() => settle(id), MOUNT_TIMEOUT_MS);
          mounting++;
          warming++;
        }
      }

      const states = new Map<string, BoardState>();
      for (const [id, tier] of tiers) {
        const frame = frames.get(id);
        if (frame && live.has(id)) states.set(id, { tier: 'live', mounted: true, ready: frame.ready });
        else if (frame) states.set(id, { tier: input.snapshots.has(id) ? 'snapshot' : 'placeholder', mounted: true, ready: frame.ready, warming: true });
        else states.set(id, { tier: tier === 'live' ? (input.snapshots.has(id) ? 'snapshot' : 'placeholder') : tier, mounted: false, ready: false });
      }
      return states;
    },
  };
}

export type TierController = ReturnType<typeof createTierController>;
