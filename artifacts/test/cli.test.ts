import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { get, readJson, waitFor, writeHtml } from './helpers';

const entry = path.resolve(__dirname, '../bin/ryugi-artifacts.cjs');
const projects: string[] = [];
const children: ChildProcess[] = [];

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi cli project '));
  projects.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of projects.splice(0)) spawnSync(process.execPath, [entry, 'stop', '--project-dir', dir], { timeout: 5000 });
  for (const child of children.splice(0)) child.kill('SIGTERM');
});

test('help and invalid options exit without starting a server', () => {
  const cwd = project();
  const help = spawnSync(process.execPath, [entry, '--help'], { cwd, encoding: 'utf8' });
  expect(help.status).toBe(0);
  expect(help.stdout).toContain('ryugi-artifacts');
  const invalid = spawnSync(process.execPath, [entry, '--no-such-option'], { cwd, encoding: 'utf8' });
  expect(invalid.status).toBe(1);
  expect(fs.existsSync(path.join(cwd, '.ryugi'))).toBe(false);
});

test('<command> --help and -h print that command\'s help without starting a server', () => {
  const cwd = project();
  for (const flag of ['--help', '-h']) {
    const result = spawnSync(process.execPath, [entry, 'publish', flag], { cwd, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^Usage: ryugi-artifacts publish/);
    expect(result.stdout).toContain('--unpublish');
    expect(result.stdout).not.toContain('auto-publish');
  }
  const comment = spawnSync(process.execPath, [entry, 'comment', 'add', '--help'], { cwd, encoding: 'utf8' });
  expect(comment.status).toBe(0);
  expect(comment.stdout).toContain('ryugi-artifacts comment reply');
  expect(fs.existsSync(path.join(cwd, '.ryugi'))).toBe(false);
});

test('--version and -v print the package version without starting a server', () => {
  const cwd = project();
  const version = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).version;
  for (const flag of ['--version', '-v']) {
    const result = spawnSync(process.execPath, [entry, flag], { cwd, encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(version);
  }
  expect(fs.existsSync(path.join(cwd, '.ryugi'))).toBe(false);
});

test.each([false, true])('serves the selected project and stops on Ctrl+C (explicit path: %s)', async (explicit) => {
  const dir = project();
  writeHtml(path.join(dir, '.ryugi/artifacts'), 'tuner', { 'index.html': '<title>CLI example</title>' });
  const child = spawn(process.execPath, [entry, ...(explicit ? [dir] : []), '--no-open'], {
    cwd: explicit ? os.tmpdir() : dir,
    env: { ...process.env, CODEX_CI: '1' },
  });
  children.push(child);
  const infoFile = path.join(dir, '.ryugi/artifacts/.state/server-info');
  await waitFor(() => fs.existsSync(infoFile), 5000);
  const info = readJson(infoFile);
  expect(info.root).toBe(path.join(fs.realpathSync(dir), '.ryugi/artifacts'));
  expect((await get(info.url.replace('localhost', '127.0.0.1'))).status).toBe(200);
  child.kill('SIGINT');
  await waitFor(() => !fs.existsSync(infoFile), 5000);
  await expect(get(info.url.replace('localhost', '127.0.0.1'))).rejects.toThrow();
}, 15000);

test('opens the library root and reuses its server for the next invocation', async () => {
  const dir = project();
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-cli-open-'));
  const log = path.join(bin, 'opened');
  for (const command of ['open', 'xdg-open']) fs.writeFileSync(path.join(bin, command), '#!/bin/sh\nprintf \'%s\\n\' "$1" > "$ARTIFACTS_TEST_OPEN_LOG"\n', { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, ARTIFACTS_TEST_OPEN_LOG: log };
  const child = spawn(process.execPath, [entry, dir], { env });
  children.push(child);
  await waitFor(() => fs.existsSync(log), 5000);
  const info = readJson(path.join(dir, '.ryugi/artifacts/.state/server-info'));
  expect(fs.readFileSync(log, 'utf8').trim()).toBe(info.url);
  const pidFile = path.join(dir, '.ryugi/artifacts/.state/server.pid');
  const pid = fs.readFileSync(pidFile, 'utf8');
  const again = spawnSync(process.execPath, [entry, '--project-dir', dir, '--no-open'], { encoding: 'utf8', env, timeout: 5000 });
  expect(again.status).toBe(0);
  expect(again.stdout).toContain(info.url);
  expect(fs.readFileSync(pidFile, 'utf8')).toBe(pid);
}, 15000);

test('the npm bin runs the start, stop and publish subcommands', () => {
  const dir = project();
  const env = { ...process.env, ARTIFACTS_OPEN: '0' };
  const started = spawnSync(process.execPath, [entry, 'start', '--project-dir', dir, '--json'], { encoding: 'utf8', env, timeout: 15000 });
  expect(JSON.parse(started.stdout.trim()).type).toBe('server-started');
  const published = spawnSync(process.execPath, [entry, 'publish', '--project-dir', dir, '--artifact', 'html/Bad'], { encoding: 'utf8', env });
  expect(published.status).toBe(1);
  const stopped = spawnSync(process.execPath, [entry, 'stop', '--project-dir', dir], { encoding: 'utf8', env, timeout: 15000 });
  expect(JSON.parse(stopped.stdout.trim())).toEqual({ status: 'stopped' });
}, 20000);
