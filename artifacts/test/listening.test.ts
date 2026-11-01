import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { listeningOn } from '../src/server/listening';

const NOW = 1_800_000_000_000;

function stateDir(sessions: { host: string; artifacts: string[]; beat?: number }[]) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-listening-'));
  sessions.forEach((session, index) => {
    const folder = path.join(dir, `${session.host}-comment-watch`);
    fs.mkdirSync(folder, { recursive: true });
    const id = `0000000${index}-0000-4000-8000-000000000000`;
    fs.writeFileSync(
      path.join(folder, `${id}.json`),
      JSON.stringify({ artifacts: session.artifacts }),
    );
    if (session.beat !== undefined)
      fs.writeFileSync(path.join(folder, `${id}.alive`), String(session.beat));
  });
  return dir;
}

test('a subscribed session with a fresh heartbeat is listening', () => {
  const dir = stateDir([{ host: 'claude', artifacts: ['artboard/pick'], beat: NOW - 2000 }]);
  expect(listeningOn(dir, 'artboard/pick', NOW)).toBe(true);
});

test('a stale heartbeat is not listening', () => {
  const dir = stateDir([{ host: 'claude', artifacts: ['artboard/pick'], beat: NOW - 11_000 }]);
  expect(listeningOn(dir, 'artboard/pick', NOW)).toBe(false);
});

test('a session subscribed elsewhere, or without a heartbeat, is not listening', () => {
  const dir = stateDir([
    { host: 'claude', artifacts: ['artboard/other'], beat: NOW },
    { host: 'claude', artifacts: ['artboard/pick'] },
  ]);
  expect(listeningOn(dir, 'artboard/pick', NOW)).toBe(false);
});

test('a Codex session subscribed to everything is listening', () => {
  const dir = stateDir([{ host: 'codex', artifacts: ['*'], beat: NOW }]);
  expect(listeningOn(dir, 'artboard/pick', NOW)).toBe(true);
});
