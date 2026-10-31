import type { View } from './view';

export const IDLE_UNLOAD_MS = 300_000;
export const READY_TIMEOUT_MS = 8000;
export const CAPTURE_TIMEOUT_MS = 10_000;

export type BoardPhase = 'mounted' | 'capturing' | 'unloaded' | 'restoring';

export interface LifecycleBoard {
  h: number;
  id: string;
  version: number;
  w: number;
  x: number;
  y: number;
}

export interface LifecycleInput {
  active: ReadonlySet<string>;
  boards: LifecycleBoard[];
  gesturing: boolean;
  view: View;
  viewport: { width: number; height: number };
}

export interface LifecycleOutput {
  capture: string[];
  phases: Map<string, BoardPhase>;
  uncapturable: ReadonlySet<string>;
  wakeAt: number | null;
}

interface BoardState {
  active: boolean;
  captureStartedAt: number;
  capturingVersion: number;
  lastActive: number;
  phase: BoardPhase;
  restoreStartedAt: number;
  uncapturableVersion: number | null;
  version: number;
}

interface Options {
  captureTimeoutMs?: number;
  idleMs?: number;
  now?: () => number;
  readyTimeoutMs?: number;
}

function overlaps(
  board: LifecycleBoard,
  view: View,
  viewport: LifecycleInput['viewport'],
  reach: number,
) {
  const left = view.x + board.x * view.k;
  const top = view.y + board.y * view.k;
  const right = left + board.w * view.k;
  const bottom = top + board.h * view.k;
  return (
    right > -viewport.width * reach &&
    left < viewport.width * (1 + reach) &&
    bottom > -viewport.height * reach &&
    top < viewport.height * (1 + reach)
  );
}

export function createBoardLifecycle({
  now = () => performance.now(),
  idleMs = IDLE_UNLOAD_MS,
  readyTimeoutMs = READY_TIMEOUT_MS,
  captureTimeoutMs = CAPTURE_TIMEOUT_MS,
}: Options = {}) {
  const states = new Map<string, BoardState>();

  const advance = (
    state: BoardState,
    board: LifecycleBoard,
    active: boolean,
    near: boolean,
    time: number,
    capture: string[],
  ) => {
    switch (state.phase) {
      case 'mounted': {
        if (
          !active &&
          time - state.lastActive >= idleMs &&
          state.uncapturableVersion !== board.version
        ) {
          state.phase = 'capturing';
          state.captureStartedAt = time;
          state.capturingVersion = board.version;
          capture.push(board.id);
        }
        return;
      }
      case 'capturing': {
        if (active) state.phase = 'mounted';
        else if (time - state.captureStartedAt >= captureTimeoutMs) {
          state.uncapturableVersion = state.capturingVersion;
          state.phase = 'mounted';
        }
        return;
      }
      case 'unloaded': {
        if (active || near) {
          state.phase = 'restoring';
          state.restoreStartedAt = time;
          state.lastActive = time;
        }
        return;
      }
      case 'restoring': {
        if (time - state.restoreStartedAt >= readyTimeoutMs) {
          state.phase = 'mounted';
          state.lastActive = time;
        }
      }
    }
  };

  const wakeOf = (state: BoardState, active: boolean) => {
    if (state.phase === 'capturing') return state.captureStartedAt + captureTimeoutMs;
    if (state.phase === 'restoring') return state.restoreStartedAt + readyTimeoutMs;
    if (state.phase === 'mounted' && !active && state.uncapturableVersion !== state.version)
      return state.lastActive + idleMs;
    return null;
  };

  return {
    update({ boards, view, viewport, active, gesturing }: LifecycleInput): LifecycleOutput {
      const time = now();
      const ids = new Set(boards.map((board) => board.id));
      for (const id of states.keys()) if (!ids.has(id)) states.delete(id);
      const capture: string[] = [];
      const phases = new Map<string, BoardPhase>();
      const uncapturable = new Set<string>();
      let wakeAt: number | null = null;
      for (const board of boards) {
        let state = states.get(board.id);
        if (!state) {
          state = {
            phase: 'mounted',
            active: false,
            lastActive: time,
            version: board.version,
            captureStartedAt: 0,
            capturingVersion: board.version,
            restoreStartedAt: 0,
            uncapturableVersion: null,
          };
          states.set(board.id, state);
        }
        const changed = state.version !== board.version;
        state.version = board.version;
        const isActive = active.has(board.id) || overlaps(board, view, viewport, 0);
        if (isActive || state.active || (changed && state.phase !== 'unloaded'))
          state.lastActive = time;
        state.active = isActive;
        if (!gesturing)
          advance(state, board, isActive, overlaps(board, view, viewport, 1), time, capture);
        phases.set(board.id, state.phase);
        if (state.uncapturableVersion === board.version) uncapturable.add(board.id);
        const wake = gesturing ? null : wakeOf(state, isActive);
        if (wake !== null && (wakeAt === null || wake < wakeAt)) wakeAt = wake;
      }
      return { phases, capture, uncapturable, wakeAt };
    },
    touch(id: string) {
      const state = states.get(id);
      if (state) state.lastActive = now();
    },
    captured(id: string, { version, ok }: { version: number; ok: boolean }) {
      const state = states.get(id);
      if (!state || state.phase !== 'capturing' || version !== state.capturingVersion) return;
      if (!ok) {
        state.uncapturableVersion = version;
        state.phase = 'mounted';
      } else if (version === state.version) state.phase = 'unloaded';
      else state.phase = 'mounted';
    },
    ready(id: string) {
      const state = states.get(id);
      if (state?.phase !== 'restoring') return;
      state.phase = 'mounted';
      state.lastActive = now();
    },
  };
}

export type BoardLifecycle = ReturnType<typeof createBoardLifecycle>;
