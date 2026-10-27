import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createAutoPublisher,
  readAutoPublishState,
  type AutoPublishOutcome,
} from '../src/server/auto-publish';

function setup(
  outcomes: Record<
    string,
    AutoPublishOutcome | (() => AutoPublishOutcome | Promise<AutoPublishOutcome>)
  > = {},
) {
  const stateFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-auto-')),
    'auto-publish.json',
  );
  const calls: string[] = [];
  const ctx = { enabled: true, token: 'tok' as string | null, stateFile, calls };
  const publisher = createAutoPublisher({
    stateFile,
    enabled: () => ctx.enabled,
    token: () => ctx.token,
    publish: async (key) => {
      calls.push(key);
      const outcome = outcomes[key] ?? { kind: 'published', created: false };
      return typeof outcome === 'function' ? outcome() : outcome;
    },
  });
  return { ...ctx, ctx, publisher, state: () => readAutoPublishState(stateFile) };
}

describe('dirty tracking', () => {
  test('ignores changes while auto-publish is off', async () => {
    const { ctx, publisher, calls } = setup();
    ctx.enabled = false;
    publisher.changed('html/a');
    ctx.enabled = true;
    await publisher.flush();
    expect(calls).toEqual([]);
  });

  test('publishes each changed artifact once and marks it clean', async () => {
    const { publisher, calls, state } = setup();
    publisher.changed('html/a');
    publisher.changed('html/a');
    publisher.changed('document/b');
    await publisher.flush();
    expect(calls.sort()).toEqual(['document/b', 'html/a']);
    expect(state().dirty).toEqual([]);
    await publisher.flush();
    expect(calls).toHaveLength(2);
  });

  test('keeps the marks in the state file for the next server', async () => {
    const first = setup();
    first.publisher.changed('html/a');
    const calls: string[] = [];
    const second = createAutoPublisher({
      stateFile: first.stateFile,
      enabled: () => true,
      token: () => 'tok',
      publish: async (key) => (calls.push(key), { kind: 'published', created: false }),
    });
    await second.flush();
    expect(calls).toEqual(['html/a']);
  });

  test('drops the mark of an artifact deleted locally', async () => {
    const { publisher, calls } = setup();
    publisher.changed('html/a');
    publisher.removed('html/a');
    await publisher.flush();
    expect(calls).toEqual([]);
  });

  test('does not flush while auto-publish is off', async () => {
    const { ctx, publisher, calls, state } = setup();
    publisher.changed('html/a');
    ctx.enabled = false;
    await publisher.flush();
    expect(calls).toEqual([]);
    expect(state().dirty).toEqual(['html/a']);
  });
});

describe('outcomes', () => {
  test('a failure or an artifact that is not ready stays dirty and is retried', async () => {
    let failing = true;
    const { publisher, calls, state } = setup({
      'html/a': () =>
        failing ? { kind: 'failed', message: 'offline' } : { kind: 'published', created: false },
      'html/b': { kind: 'not-ready' },
    });
    publisher.changed('html/a');
    publisher.changed('html/b');
    await publisher.flush();
    expect(state().dirty.sort()).toEqual(['html/a', 'html/b']);
    failing = false;
    await publisher.flush();
    expect(calls.filter((k) => k === 'html/a')).toHaveLength(2);
    expect(state().dirty).toEqual(['html/b']);
    expect(state().notice).toBeNull();
  });

  test('three failed runs in a row raise a failing notice naming the artifact', async () => {
    const { publisher, state } = setup({
      'html/a': { kind: 'failed', message: 'cloud answered 500' },
    });
    publisher.changed('html/a');
    await publisher.flush();
    await publisher.flush();
    expect(state().notice).toBeNull();
    await publisher.flush();
    expect(state().notice).toMatchObject({ kind: 'failing' });
    expect(state().notice!.message).toContain('html/a');
    expect(state().notice!.message).toContain('cloud answered 500');
  });

  test('a publish that succeeds clears the failing notice', async () => {
    let failing = true;
    const { publisher, state } = setup({
      'html/a': () => (failing ? { kind: 'not-ready' } : { kind: 'published', created: false }),
    });
    publisher.changed('html/a');
    for (let i = 0; i < 3; i++) await publisher.flush();
    expect(state().notice).toMatchObject({ kind: 'failing' });
    failing = false;
    await publisher.flush();
    expect(state().notice).toBeNull();
  });

  test('logs the outcome of every attempt', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { publisher } = setup({ 'html/a': { kind: 'failed', message: 'offline' } });
    publisher.changed('html/a');
    publisher.changed('html/b');
    await publisher.flush();
    const lines = log.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(lines).toEqual([
      { type: 'auto-publish', key: 'html/a', outcome: 'failed', message: 'offline' },
      { type: 'auto-publish', key: 'html/b', outcome: 'published' },
    ]);
    log.mockRestore();
  });

  test('an opted-out or vanished artifact drops its mark', async () => {
    const { publisher, state } = setup({
      'html/a': { kind: 'opted-out' },
      'html/b': { kind: 'gone' },
    });
    publisher.changed('html/a');
    publisher.changed('html/b');
    await publisher.flush();
    expect(state().dirty).toEqual([]);
  });
});

describe('flush queue', () => {
  test('a flush requested during a flush runs once more afterwards, never in parallel', async () => {
    let release!: () => void;
    let active = 0;
    let peak = 0;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { publisher, calls } = setup({
      'html/a': async () => {
        active++;
        peak = Math.max(peak, active);
        await gate;
        active--;
        return { kind: 'published', created: false };
      },
    });
    publisher.changed('html/a');
    const first = publisher.flush();
    publisher.changed('html/b');
    const second = publisher.flush();
    const third = publisher.flush();
    release();
    await Promise.all([first, second, third]);
    expect(peak).toBe(1);
    expect(calls).toEqual(['html/a', 'html/b']);
  });
});

describe('signed out', () => {
  test('pauses with one notice until a different token appears', async () => {
    let signedOut = true;
    const { ctx, publisher, calls, state } = setup({
      'html/a': () => (signedOut ? { kind: 'signed-out' } : { kind: 'published', created: false }),
    });
    publisher.changed('html/a');
    await publisher.flush();
    const notice = state().notice;
    expect(notice).toMatchObject({ kind: 'signed-out' });
    await publisher.flush();
    expect(calls).toHaveLength(1);
    expect(state().notice).toEqual(notice);
    signedOut = false;
    ctx.token = 'new-token';
    await publisher.flush();
    expect(calls).toHaveLength(2);
    expect(state().notice).toBeNull();
    expect(state().dirty).toEqual([]);
  });
});

describe('account cap', () => {
  test('notifies once per episode, keeps republishing existing copies, and clears after a create succeeds', async () => {
    let capped = true;
    const { publisher, calls, state } = setup({
      'html/new': () =>
        capped
          ? { kind: 'cannot-create', message: 'limit of 100 published artifacts reached' }
          : { kind: 'published', created: true },
      'html/old': { kind: 'published', created: false },
    });
    publisher.changed('html/new');
    publisher.changed('html/old');
    await publisher.flush();
    const notice = state().notice;
    expect(notice).toMatchObject({
      kind: 'cap',
      message: 'limit of 100 published artifacts reached',
    });
    expect(state().dirty).toEqual(['html/new']);
    publisher.changed('html/old');
    await publisher.flush();
    expect(state().notice).toEqual(notice);
    expect(calls.filter((k) => k === 'html/old')).toHaveLength(2);
    capped = false;
    await publisher.flush();
    expect(state().notice).toBeNull();
    expect(state().dirty).toEqual([]);
  });
});

describe('timed flush', () => {
  const MINUTE = 60_000;
  afterEach(() => {
    vi.useRealTimers();
  });

  test('publishes after five quiet minutes', async () => {
    vi.useFakeTimers();
    const { publisher, calls } = setup();
    publisher.changed('html/a');
    await vi.advanceTimersByTimeAsync(5 * MINUTE - 1);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(['html/a']);
  });

  test('each change restarts the quiet period', async () => {
    vi.useFakeTimers();
    const { publisher, calls } = setup();
    publisher.changed('html/a');
    await vi.advanceTimersByTimeAsync(4 * MINUTE);
    publisher.changed('html/a');
    await vi.advanceTimersByTimeAsync(4 * MINUTE);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(calls).toEqual(['html/a']);
  });

  test('steady editing still publishes fifteen minutes after the first change', async () => {
    vi.useFakeTimers();
    const { publisher, calls } = setup();
    for (let minute = 0; minute < 15; minute++) {
      publisher.changed('html/a');
      await vi.advanceTimersByTimeAsync(MINUTE - 1);
      expect(calls).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(calls).toEqual(['html/a']);
  });

  test('a turn-end flush cancels the pending timers', async () => {
    vi.useFakeTimers();
    const { publisher, calls } = setup();
    publisher.changed('html/a');
    await publisher.flush();
    await vi.advanceTimersByTimeAsync(15 * MINUTE);
    expect(calls).toEqual(['html/a']);
  });

  test('a failed publish is retried after another quiet period', async () => {
    vi.useFakeTimers();
    let failing = true;
    const { publisher, calls } = setup({
      'html/a': () =>
        failing ? { kind: 'failed', message: 'offline' } : { kind: 'published', created: false },
    });
    publisher.changed('html/a');
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    failing = false;
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(calls).toEqual(['html/a', 'html/a']);
    await vi.advanceTimersByTimeAsync(15 * MINUTE);
    expect(calls).toHaveLength(2);
  });

  test('an artifact the account cap refuses is not retried on a timer', async () => {
    vi.useFakeTimers();
    const { publisher, calls } = setup({
      'html/a': { kind: 'cannot-create', message: 'limit reached' },
    });
    publisher.changed('html/a');
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    expect(calls).toEqual(['html/a']);
  });

  test('marks left by the last server are published after a quiet period', async () => {
    const first = setup();
    first.publisher.changed('html/a');
    first.publisher.close();
    vi.useFakeTimers();
    const calls: string[] = [];
    createAutoPublisher({
      stateFile: first.stateFile,
      enabled: () => true,
      token: () => 'tok',
      publish: async (key) => (calls.push(key), { kind: 'published', created: false }),
    });
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(calls).toEqual(['html/a']);
  });

  test('closing stops the timers', async () => {
    vi.useFakeTimers();
    const { publisher, calls } = setup();
    publisher.changed('html/a');
    publisher.close();
    await vi.advanceTimersByTimeAsync(15 * MINUTE);
    expect(calls).toEqual([]);
  });
});
