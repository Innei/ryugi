import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';

const script = path.resolve(__dirname, '../../hooks/start-artifacts.cjs');
const launcher = path.resolve(__dirname, '../../skills/artifacts/app/ryugi-artifacts.cjs');
const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

function project({ signedIn, published }: { signedIn: boolean; published: boolean }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-session-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-session-home-'));
  fs.mkdirSync(path.join(dir, '.ryugi', 'artifacts', 'document', 'plan'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.ryugi', 'artifacts', 'document', 'plan', 'doc.xml'), '<doc><p>one</p></doc>');
  const artifacts = published ? { 'document/plan': { cloud: { id: 'c1', url: 'u', publishedAt: 't', visibility: 'private' } } } : { 'html/x': { cloud: { id: 'c2', url: 'u', publishedAt: 't', visibility: 'private' } } };
  fs.writeFileSync(path.join(dir, '.ryugi', 'config.json'), JSON.stringify({ version: 1, artifacts }));
  if (signedIn) {
    fs.mkdirSync(path.join(home, 'ryugi'), { recursive: true });
    fs.writeFileSync(path.join(home, 'ryugi', 'credentials.json'), JSON.stringify({ origin: 'https://ryugi.innei.dev', token: 't', login: 'innei' }));
  }
  const env = { ...process.env, XDG_CONFIG_HOME: home, ARTIFACTS_OPEN: '0', RYUGI_ARTIFACTS_OWNER: String(process.pid) };
  cleanups.push(() => spawnSync(process.execPath, [launcher, 'stop', '--project-dir', dir], { env, timeout: 10000 }));
  const run = () => spawnSync(process.execPath, [script, dir], { encoding: 'utf8', env, timeout: 30000 });
  const info = path.join(dir, '.ryugi', 'artifacts', '.state', 'server-info');
  return { dir, run, info };
}

test('starts the artifacts server for a signed-in project with a published document, owned by the session', () => {
  const { dir, run, info } = project({ signedIn: true, published: true });
  expect(run().status).toBe(0);
  expect(fs.existsSync(info)).toBe(true);
  expect(fs.readFileSync(path.join(dir, '.ryugi', 'artifacts', '.state', 'owners'), 'utf8').trim()).toBe(String(process.pid));
});

test('does nothing when signed out', () => {
  const { run, info } = project({ signedIn: false, published: true });
  expect(run().status).toBe(0);
  expect(fs.existsSync(info)).toBe(false);
});

test('does nothing when only non-document artifacts are published', () => {
  const { run, info } = project({ signedIn: true, published: false });
  expect(run().status).toBe(0);
  expect(fs.existsSync(info)).toBe(false);
});
