import crypto from 'node:crypto';
import fs from 'node:fs';

import { writeJsonAtomic } from './state';

export type AutoPublishOutcome =
  | { kind: 'published'; created: boolean }
  | { kind: 'not-ready' }
  | { kind: 'failed'; message: string }
  | { kind: 'opted-out' }
  | { kind: 'gone' }
  | { kind: 'signed-out' }
  | { kind: 'cannot-create'; message: string; upgradeUrl?: string };

export interface AutoPublishNotice {
  id: string;
  kind: 'signed-out' | 'cap' | 'failing';
  message: string;
  upgradeUrl?: string;
}

export interface AutoPublishState {
  dirty: string[];
  notice: AutoPublishNotice | null;
  paused: { token: string | null } | null;
}

interface AutoPublisherOptions {
  enabled: () => boolean;
  idleMs?: number;
  maxWaitMs?: number;
  publish: (key: string) => Promise<AutoPublishOutcome>;
  stateFile: string;
  token: () => string | null;
}

const IDLE_MS = 5 * 60 * 1000;
const MAX_WAIT_MS = 15 * 60 * 1000;

const SIGNED_OUT_MESSAGE = 'auto-publish paused: the Ryugi Cloud sign-in expired';
const FAILURES_BEFORE_NOTICE = 3;

function isNotice(value: unknown): value is AutoPublishNotice {
  if (typeof value !== 'object' || value === null) return false;
  const { id, kind, message } = value as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    (kind === 'signed-out' || kind === 'cap' || kind === 'failing') &&
    typeof message === 'string'
  );
}

export function readAutoPublishState(file: string): AutoPublishState {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (typeof parsed === 'object' && parsed !== null) raw = parsed as Record<string, unknown>;
  } catch {}
  const dirty = Array.isArray(raw.dirty)
    ? raw.dirty.filter((key): key is string => typeof key === 'string')
    : [];
  const paused = raw.paused as { token?: unknown } | null | undefined;
  return {
    dirty,
    notice: isNotice(raw.notice) ? raw.notice : null,
    paused:
      paused && (typeof paused.token === 'string' || paused.token === null)
        ? { token: paused.token }
        : null,
  };
}

export function createAutoPublisher(options: AutoPublisherOptions) {
  const saved = readAutoPublishState(options.stateFile);
  const dirty = new Set(saved.dirty);
  let notice = saved.notice;
  let paused = saved.paused;
  const remarked = new Set<string>();
  const failures = new Map<string, number>();
  const save = () =>
    writeJsonAtomic(options.stateFile, {
      dirty: [...dirty],
      notice,
      paused,
    } satisfies AutoPublishState);
  const raise = (kind: AutoPublishNotice['kind'], message: string, upgradeUrl?: string) => {
    if (notice?.kind !== kind)
      notice = { id: crypto.randomUUID(), kind, message, ...(upgradeUrl ? { upgradeUrl } : {}) };
  };

  let idleTimer: NodeJS.Timeout | null = null;
  let maxTimer: NodeJS.Timeout | null = null;
  const clearTimers = () => {
    if (idleTimer) clearTimeout(idleTimer);
    if (maxTimer) clearTimeout(maxTimer);
    idleTimer = maxTimer = null;
  };
  const schedule = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void flush(), options.idleMs ?? IDLE_MS).unref();
    maxTimer ??= setTimeout(() => void flush(), options.maxWaitMs ?? MAX_WAIT_MS).unref();
  };

  const run = async () => {
    clearTimers();
    if (!options.enabled() || dirty.size === 0) return;
    const token = options.token();
    if (paused && paused.token === token) return;
    if (paused) {
      paused = null;
      if (notice?.kind === 'signed-out') notice = null;
    }
    let retry = false;
    for (const key of dirty) {
      remarked.delete(key);
      const outcome = await options.publish(key);
      console.error(
        JSON.stringify({
          type: 'auto-publish',
          key,
          outcome: outcome.kind,
          ...('message' in outcome ? { message: outcome.message } : {}),
        }),
      );
      if (outcome.kind === 'failed' || outcome.kind === 'not-ready') {
        const count = (failures.get(key) ?? 0) + 1;
        failures.set(key, count);
        if (count >= FAILURES_BEFORE_NOTICE)
          raise(
            'failing',
            `${key}: ${outcome.kind === 'failed' ? outcome.message : 'not ready to publish; fix its warnings'}`,
          );
      } else {
        failures.delete(key);
        if (failures.size === 0 && notice?.kind === 'failing') notice = null;
      }
      if (outcome.kind === 'signed-out') {
        paused = { token };
        raise('signed-out', SIGNED_OUT_MESSAGE);
        break;
      }
      if (outcome.kind === 'published') {
        if (remarked.has(key)) retry = true;
        else dirty.delete(key);
        if (outcome.created && notice?.kind === 'cap') notice = null;
      } else if (outcome.kind === 'opted-out' || outcome.kind === 'gone') {
        dirty.delete(key);
      } else if (outcome.kind === 'cannot-create') {
        raise('cap', outcome.message, outcome.upgradeUrl);
      } else {
        retry = true;
      }
    }
    save();
    if (retry) schedule();
  };

  let running: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  const flush = (): Promise<void> => {
    if (!running) {
      running = run()
        .catch((err: Error) =>
          console.error(JSON.stringify({ type: 'auto-publish-error', error: err.message })),
        )
        .finally(() => {
          running = null;
        });
      return running;
    }
    queued ??= running.then(() => {
      queued = null;
      return flush();
    });
    return queued;
  };

  if (dirty.size > 0) schedule();

  return {
    changed(key: string) {
      if (!options.enabled()) return;
      dirty.add(key);
      remarked.add(key);
      save();
      schedule();
    },
    removed(key: string) {
      if (!dirty.delete(key)) return;
      save();
    },
    flush,
    close: clearTimers,
  };
}

export type AutoPublisher = ReturnType<typeof createAutoPublisher>;
