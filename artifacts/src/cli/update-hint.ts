import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { wantsHelp } from './command';

export interface LatestRecord {
  version: string;
  checkedAt: number;
}

export interface UpdateCheckInput {
  current: string;
  cached: LatestRecord | null;
  now: number;
  env: NodeJS.ProcessEnv;
  tty: boolean;
  json: boolean;
  argv?: string[];
}

const CHECK_MS = 24 * 60 * 60 * 1000;
const RELEASE = /^\d+\.\d+\.\d+$/;

export function newer(a: string, b: string) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i]! > y[i]!;
  return false;
}

export function updateCheck({ current, cached, now, env, tty, json, argv = [] }: UpdateCheckInput) {
  if (!tty || json || env.CI || env.NO_UPDATE_NOTIFIER || env.RYUGI_ARTIFACTS_COMMAND)
    return { hint: null, refresh: false };
  const latest = cached?.version ?? '';
  const quiet = argv[0] === 'update' || wantsHelp(argv);
  const hint =
    !quiet && RELEASE.test(current) && RELEASE.test(latest) && newer(latest, current)
      ? `ryugi-artifacts ${latest} is available (you have ${current}). Run \`ryugi-artifacts update\` to install it.`
      : null;
  return { hint, refresh: !cached || now - cached.checkedAt >= CHECK_MS };
}

export const latestFile = (env: NodeJS.ProcessEnv) =>
  path.join(
    env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
    'ryugi',
    'artifacts',
    'latest.json',
  );

export function readLatest(file: string): LatestRecord | null {
  try {
    const { version, checkedAt } = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof version === 'string' && typeof checkedAt === 'number'
      ? { version, checkedAt }
      : null;
  } catch {
    return null;
  }
}

export function writeLatest(file: string, version: string, checkedAt: number) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ version, checkedAt }));
    fs.renameSync(tmp, file);
  } catch {}
}

const REFRESH = `
const fs = require('node:fs');
const path = require('node:path');
const [file, registry] = process.argv.slice(1);
fetch(new URL('ryugi-artifacts/latest', registry), { signal: AbortSignal.timeout(10000) })
  .then((res) => res.json())
  .then(({ version }) => {
    if (!/^\\d+\\.\\d+\\.\\d+/.test(version || '')) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.' + process.pid;
    fs.writeFileSync(tmp, JSON.stringify({ version, checkedAt: Date.now() }));
    fs.renameSync(tmp, file);
  })
  .catch(() => {});
`;

export function refreshLatest(file: string, registry: string) {
  const base = registry.endsWith('/') ? registry : `${registry}/`;
  const child = spawn(process.execPath, ['-e', REFRESH, file, base], {
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => {});
  child.unref();
}

export function notifyUpdate(current: string, json: boolean, argv: string[]) {
  const file = latestFile(process.env);
  const { hint, refresh } = updateCheck({
    current,
    cached: readLatest(file),
    now: Date.now(),
    env: process.env,
    tty: !!process.stderr.isTTY,
    json,
    argv,
  });
  if (hint) console.error(hint);
  if (refresh)
    refreshLatest(file, process.env.npm_config_registry || 'https://registry.npmjs.org/');
}
