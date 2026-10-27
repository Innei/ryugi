import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

const entry = path.resolve(__dirname, '../bin/ryugi-artifacts.cjs');

function setup() {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-config-project-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-config-home-'));
  const run = (...args: string[]) => {
    const result = spawnSync(
      process.execPath,
      [entry, 'config', '--json', '--project-dir', project, ...args],
      { encoding: 'utf8', env: { ...process.env, XDG_CONFIG_HOME: home } },
    );
    return {
      status: result.status,
      json: JSON.parse(result.stdout.trim().split('\n').pop() || '{}'),
    };
  };
  const globalFile = path.join(home, 'ryugi', 'config.json');
  const projectFile = path.join(project, '.ryugi', 'config.json');
  return {
    run,
    read: (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')),
    globalFile,
    projectFile,
    project,
  };
}

test('turns auto-publish on and off for every project', () => {
  const { run, read, globalFile } = setup();
  expect(run('--auto-publish', 'off')).toEqual({
    status: 0,
    json: { type: 'auto-publish', global: false, project: null },
  });
  expect(read(globalFile).autoPublish).toBe(false);
  expect(run('--auto-publish', 'on').json).toEqual({
    type: 'auto-publish',
    global: true,
    project: null,
  });
});

test('sets and clears the override for one project', () => {
  const { run, read, projectFile } = setup();
  expect(run('--auto-publish', 'off', '--project').json).toEqual({
    type: 'auto-publish',
    global: null,
    project: false,
  });
  expect(read(projectFile)).toMatchObject({ autoPublish: false });
  expect(fs.readFileSync(path.join(path.dirname(projectFile), '.gitignore'), 'utf8')).toContain(
    'config.json',
  );
  expect(run('--auto-publish', 'inherit', '--project').json).toEqual({
    type: 'auto-publish',
    global: null,
    project: null,
  });
});

test('prints the current values without --auto-publish', () => {
  const { run } = setup();
  run('--auto-publish', 'on');
  expect(run().json).toEqual({ type: 'auto-publish', global: true, project: null });
});

test('rejects unknown values', () => {
  const { run } = setup();
  expect(run('--auto-publish', 'maybe').status).toBe(1);
  expect(run('--auto-publish', 'inherit').status).toBe(1);
});
