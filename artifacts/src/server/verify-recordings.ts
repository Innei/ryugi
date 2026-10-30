import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { CanvasPayload, RecordingState } from '../shared/types';
import { resolveBoardFile } from './paths';
import { trimRecording, type TrimResult } from './recording-trim';
import { writeJsonAtomic } from './state';

// Bump when the preparation policy changes; source bytes + policy identify a
// durable cache entry. Failed jobs are retried after a restart or source edit.
const POLICY = 'idle-ends-v1';
const STABLE_MS = 750;
const digest = (data: Buffer | string) => crypto.createHash('sha256').update(data).digest('hex');
const stamp = (file: string) => {
  const stat = fs.statSync(file);
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
};
interface Cached {
  hash?: string;
  result: TrimResult;
}
interface Job {
  artifact: string;
  controller: AbortController;
  file: string;
  hash?: string;
  key: string;
  output?: string;
  stamp: string;
  state: RecordingState;
  timer?: NodeJS.Timeout;
  virtual?: string;
}
interface Options {
  onChange: (id: string) => void;
  // The processor is also a boundary for alternative local media backends.
  prepare?: typeof trimRecording;
  stableMs?: number;
  stateDir: string;
}

export function createVerifyRecordings(options: Options) {
  const jobs = new Map<string, Job>();
  const boardJobs = new Map<string, Job>();
  const queue: Job[] = [];
  const files = new Map<string, string>();
  let running: Promise<void> | undefined;
  let closed = false;
  const current = (job: Job) =>
    !closed && jobs.get(job.key) === job && !job.controller.signal.aborted;
  const notify = (job: Job) => {
    if (current(job)) options.onChange(job.artifact);
  };
  const cacheDir = path.join(options.stateDir, 'recordings');

  async function process(job: Job) {
    let temporary: string | undefined;
    try {
      if (stamp(job.file) !== job.stamp) {
        jobs.delete(job.key);
        options.onChange(job.artifact);
        return;
      }
      const bytes = await fs.promises.readFile(job.file);
      if (!current(job)) return;
      if (stamp(job.file) !== job.stamp) {
        jobs.delete(job.key);
        options.onChange(job.artifact);
        return;
      }
      const key = digest(`${POLICY}:${digest(bytes)}`);
      const dir = path.join(cacheDir, key);
      const output = path.join(dir, 'clip.mp4');
      const metadata = path.join(dir, 'result.json');
      let cached: Cached | undefined;
      try {
        const saved: Cached = JSON.parse(fs.readFileSync(metadata, 'utf8'));
        if (
          saved.result.status !== 'trimmed' ||
          (fs.existsSync(output) && saved.hash === digest(fs.readFileSync(output)))
        )
          cached = saved;
      } catch {
        /* uncached or incomplete entry */
      }
      if (!cached) {
        fs.mkdirSync(cacheDir, { recursive: true });
        temporary = fs.mkdtempSync(path.join(cacheDir, '.prepare-'));
        const input = path.join(temporary, 'capture');
        const prepared = path.join(temporary, 'clip.mp4');
        fs.writeFileSync(input, bytes);
        const result = await (options.prepare ?? trimRecording)(
          input,
          prepared,
          job.controller.signal,
        );
        if (!current(job)) return;
        if (stamp(job.file) !== job.stamp) {
          jobs.delete(job.key);
          options.onChange(job.artifact);
          return;
        }
        fs.mkdirSync(dir, { recursive: true });
        const hash = result.status === 'trimmed' ? digest(fs.readFileSync(prepared)) : undefined;
        if (result.status === 'trimmed') fs.copyFileSync(prepared, output);
        cached = { result, ...(hash ? { hash } : {}) };
        writeJsonAtomic(metadata, cached);
      }
      if (!current(job)) return;
      if (stamp(job.file) !== job.stamp) {
        jobs.delete(job.key);
        options.onChange(job.artifact);
        return;
      }
      job.state = { ...cached.result, status: 'ready', outcome: cached.result.status };
      if (cached.result.status === 'trimmed') {
        job.output = output;
        job.virtual = `pages/ryugi-recordings/${key}.mp4`;
        job.hash = cached.hash;
        files.set(`${job.artifact}/${job.virtual}`, output);
      }
      notify(job);
    } catch (error) {
      if (!current(job)) return;
      job.state = {
        status: 'original',
        warning: `Using the original recording: ${(error as Error).message}`,
      };
      notify(job);
    } finally {
      if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
    }
  }
  function pump() {
    if (running || closed) return;
    const job = queue.shift();
    if (!job) return;
    if (!current(job)) {
      pump();
      return;
    }
    running = process(job).finally(() => {
      running = undefined;
      pump();
    });
  }
  const stop = (job: Job) => {
    clearTimeout(job.timer);
    job.controller.abort();
    jobs.delete(job.key);
  };

  return {
    project(id: string, dir: string, payload: CanvasPayload): CanvasPayload {
      if (!payload.canvas || closed) return payload;
      const canvas = { ...payload.canvas, boards: { ...payload.canvas.boards } };
      const eligible = new Set(
        Object.values(canvas.groups ?? {})
          .filter((group) => group.verify)
          .flatMap((group) => group.boards),
      );
      const active = new Set<string>();
      const recordings: Record<string, RecordingState> = {};
      const pending = new Set(payload.pending);
      const versions = { ...payload.versions };
      for (const key of boardJobs.keys()) if (key.startsWith(`${id}/`)) boardJobs.delete(key);
      for (const [boardId, board] of Object.entries(canvas.boards)) {
        if (board.type !== 'video' || board.trim === false || !eligible.has(boardId)) continue;
        const file = resolveBoardFile(dir, board.file);
        if (!file || !versions[board.file]) continue;
        const key = `${id}/${board.file}`;
        active.add(key);
        let job = jobs.get(key);
        const version = stamp(file);
        if (job && job.stamp !== version) {
          stop(job);
          job = undefined;
        }
        if (!job) {
          job = {
            artifact: id,
            key,
            file,
            stamp: version,
            state: { status: 'processing' },
            controller: new AbortController(),
          };
          jobs.set(key, job);
          const scheduled = job;
          job.timer = setTimeout(() => {
            queue.push(scheduled);
            pump();
          }, options.stableMs ?? STABLE_MS);
        }
        boardJobs.set(`${id}/${boardId}`, job);
        recordings[boardId] = job.state;
        if (job.state.status === 'processing') pending.add(boardId);
        if (job.virtual && job.output) {
          canvas.boards[boardId] = { ...board, file: job.virtual, src: job.virtual };
          versions[job.virtual] = fs.statSync(job.output).mtimeMs;
        }
      }
      for (const job of jobs.values()) if (job.artifact === id && !active.has(job.key)) stop(job);
      canvas.building = pending.size > 0;
      return {
        ...payload,
        canvas,
        versions,
        pending: [...pending].sort(),
        ...(Object.keys(recordings).length ? { recordings } : {}),
      };
    },
    resolve(id: string, relative: string) {
      return files.get(`${id}/${relative}`) ?? null;
    },
    evidenceHash(id: string, board: string, source: string) {
      const job = boardJobs.get(`${id}/${board}`);
      return job?.state.status === 'processing'
        ? `${source}:preparing`
        : job?.hash
          ? digest(`${source}:${job.hash}`)
          : source;
    },
    overrides(id: string, payload: CanvasPayload) {
      const overrides = new Map<string, Buffer | null>();
      if (!payload.canvas) return overrides;
      const referenced = new Set(Object.values(payload.canvas.boards).map((board) => board.file));
      for (const job of jobs.values()) {
        if (job.artifact !== id || !job.virtual || !job.output || !referenced.has(job.virtual))
          continue;
        const original = job.key.slice(id.length + 1);
        if (!referenced.has(original)) overrides.set(original, null);
        overrides.set(job.virtual, fs.readFileSync(job.output));
      }
      if (overrides.size) overrides.set('canvas.json', Buffer.from(JSON.stringify(payload.canvas)));
      return overrides;
    },
    async close() {
      closed = true;
      for (const job of jobs.values()) stop(job);
      await running;
    },
  };
}
