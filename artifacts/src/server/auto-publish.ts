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
  | { kind: 'cannot-create'; message: string };

export interface AutoPublishNotice {
  id: string;
  kind: 'signed-out' | 'cap';
  message: string;
}

export interface AutoPublishState {
  dirty: string[];
  notice: AutoPublishNotice | null;
  paused: { token: string | null } | null;
}

interface AutoPublisherOptions {
  stateFile: string;
  enabled: () => boolean;
  token: () => string | null;
  publish: (key: string) => Promise<AutoPublishOutcome>;
}

const SIGNED_OUT_MESSAGE = 'auto-publish paused: the Ryugi Cloud sign-in expired';

function isNotice(value: unknown): value is AutoPublishNotice {
  if (typeof value !== 'object' || value === null) return false;
  const { id, kind, message } = value as Record<string, unknown>;
  return typeof id === 'string' && (kind === 'signed-out' || kind === 'cap') && typeof message === 'string';
}

export function readAutoPublishState(file: string): AutoPublishState {
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (typeof parsed === 'object' && parsed !== null) raw = parsed as Record<string, unknown>;
  } catch {}
  const dirty = Array.isArray(raw.dirty) ? raw.dirty.filter((key): key is string => typeof key === 'string') : [];
  const paused = raw.paused as { token?: unknown } | null | undefined;
  return {
    dirty,
    notice: isNotice(raw.notice) ? raw.notice : null,
    paused: paused && (typeof paused.token === 'string' || paused.token === null) ? { token: paused.token } : null,
  };
}

export function createAutoPublisher(options: AutoPublisherOptions) {
  const saved = readAutoPublishState(options.stateFile);
  const dirty = new Set(saved.dirty);
  let notice = saved.notice;
  let paused = saved.paused;
  const remarked = new Set<string>();
  const save = () => writeJsonAtomic(options.stateFile, { dirty: [...dirty], notice, paused } satisfies AutoPublishState);
  const raise = (kind: AutoPublishNotice['kind'], message: string) => {
    if (notice?.kind !== kind) notice = { id: crypto.randomUUID(), kind, message };
  };

  const run = async () => {
    if (!options.enabled() || dirty.size === 0) return;
    const token = options.token();
    if (paused && paused.token === token) return;
    if (paused) {
      paused = null;
      if (notice?.kind === 'signed-out') notice = null;
    }
    for (const key of [...dirty]) {
      remarked.delete(key);
      const outcome = await options.publish(key);
      if (outcome.kind === 'signed-out') {
        paused = { token };
        raise('signed-out', SIGNED_OUT_MESSAGE);
        break;
      }
      if (outcome.kind === 'published') {
        if (!remarked.has(key)) dirty.delete(key);
        if (outcome.created && notice?.kind === 'cap') notice = null;
      } else if (outcome.kind === 'opted-out' || outcome.kind === 'gone') {
        dirty.delete(key);
      } else if (outcome.kind === 'cannot-create') {
        raise('cap', outcome.message);
      }
    }
    save();
  };

  let running: Promise<void> | null = null;
  let queued: Promise<void> | null = null;
  const flush = (): Promise<void> => {
    if (!running) {
      running = run()
        .catch((err: Error) => console.error(JSON.stringify({ type: 'auto-publish-error', error: err.message })))
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

  return {
    changed(key: string) {
      if (!options.enabled()) return;
      dirty.add(key);
      remarked.add(key);
      save();
    },
    removed(key: string) {
      if (!dirty.delete(key)) return;
      save();
    },
    flush,
  };
}

export type AutoPublisher = ReturnType<typeof createAutoPublisher>;
