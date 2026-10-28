import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

import { credentialsFile, writeCredentials } from '../src/server/credentials';
import { waitFor } from './helpers';

const cli = path.resolve(__dirname, '../dist/cli.cjs');
const projects: string[] = [];
const children: ChildProcess[] = [];

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-login-hint-'));
  const project = path.join(dir, 'project');
  fs.mkdirSync(project);
  projects.push(project);
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(dir, 'config'),
    APPDATA: path.join(dir, 'config'),
    ARTIFACTS_OPEN: '0',
    NO_UPDATE_NOTIFIER: '1',
    RYUGI_CLOUD_ORIGIN: process.env.RYUGI_CLOUD_ORIGIN || 'http://127.0.0.1:9',
  };
  const run = (args: string[], extraEnv: NodeJS.ProcessEnv = {}) =>
    spawnSync(process.execPath, [cli, ...args, '--project-dir', project], {
      env: { ...env, ...extraEnv },
      encoding: 'utf8',
      timeout: 15000,
    });
  const start = () => {
    const result = run(['start', '--json', '--background']);
    expect(result.status).toBe(0);
    return JSON.parse(result.stdout.trim());
  };
  return { project, env, run, start };
}

afterEach(() => {
  for (const child of children.splice(0)) child.kill('SIGTERM');
  for (const project of projects.splice(0))
    spawnSync(process.execPath, [cli, 'stop', '--project-dir', project], { timeout: 5000 });
});

test('the first successful start recommends optional sign-in to humans and agents once across projects', () => {
  const { run, start, env } = setup();
  expect(run(['--help']).status).toBe(0);
  expect(run(['--version']).status).toBe(0);
  expect(run(['start', '--artifact', 'invalid']).status).toBe(1);
  const first = start();
  expect(first.type).toBe('server-started');
  expect(first.loginHint.message).toMatch(/Ryugi Cloud/);
  expect(first.loginHint.message).toMatch(/optional/i);
  expect(first.loginHint.command).toContain('publish --login');
  expect(first.loginHint.projectDir).toBe(path.dirname(path.dirname(first.root)));
  expect(first.loginHint.agentInstruction).toMatch(/human partner/);
  expect(start().loginHint).toBeUndefined();
  const other = setup();
  const result = other.run(['start', '--json', '--background'], env);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout.trim()).loginHint).toBeUndefined();
}, 30000);

test('uses the skill launcher invocation in the suggested login command', () => {
  const { run } = setup();
  const result = run(['start', '--json', '--background'], {
    RYUGI_ARTIFACTS_COMMAND: 'node "/plugin with spaces/ryugi-artifacts.cjs"',
  });
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout.trim()).loginHint.command).toBe(
    'node "/plugin with spaces/ryugi-artifacts.cjs" publish --login',
  );
});

test('does not recommend signing in to an already signed-in account', () => {
  const { env, start } = setup();
  writeCredentials(credentialsFile(env, process.platform, os.homedir()), {
    origin: env.RYUGI_CLOUD_ORIGIN!,
    token: 'test-token',
    login: 'tester',
  });
  expect(start().loginHint).toBeUndefined();
});

test('credentials for another cloud do not suppress the recommendation', () => {
  const { env, start } = setup();
  writeCredentials(credentialsFile(env, process.platform, os.homedir()), {
    origin: 'https://other-cloud.example',
    token: 'test-token',
    login: 'tester',
  });
  expect(start().loginHint).toBeDefined();
});

test('a non-writable config location does not prevent local use or hide the hint', () => {
  const { env, start } = setup();
  fs.writeFileSync(env.XDG_CONFIG_HOME, 'a file, not a directory');
  expect(start().loginHint).toBeDefined();
});

test('terminal start output includes the recommendation and login command', () => {
  const { project, env } = setup();
  const script = `process.stdout.isTTY = true; process.argv.splice(1, 0, ${JSON.stringify(cli)}); require(${JSON.stringify(cli)});`;
  const result = spawnSync(
    process.execPath,
    ['-e', script, 'start', '--project-dir', project, '--background'],
    { env, encoding: 'utf8', timeout: 15000 },
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/http:\/\/localhost:/);
  expect(result.stdout).toContain('Ryugi Cloud');
  expect(result.stdout).toContain('publish --login');
});

test('the library shows the hint when starting a foreground server', async () => {
  const { project, env } = setup();
  const child = spawn(process.execPath, [cli, project, '--no-open'], { env });
  children.push(child);
  let stdout = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  await waitFor(() => stdout.includes('Press Ctrl+C'), 5000);
  expect(stdout).toContain('Ryugi Cloud');
  expect(stdout).toContain('publish --login');
});
