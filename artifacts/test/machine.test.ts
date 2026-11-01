import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import {
  DORMANT_AFTER_MS,
  isDormant,
  machinePaths,
  pruneProjects,
  readProjects,
  registerProject,
  removeProject,
  touchProject,
} from '../src/server/machine';

const tempHome = () =>
  path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-machine-')), 'server');

function newProject() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-project-')));
  fs.mkdirSync(path.join(dir, '.ryugi', 'artifacts'), { recursive: true });
  return dir;
}

test('machine state lives in ~/.ryugi/server unless RYUGI_SERVER_HOME says otherwise', () => {
  expect(machinePaths({}, '/Users/me').home).toBe('/Users/me/.ryugi/server');
  const paths = machinePaths({ RYUGI_SERVER_HOME: '/tmp/x' }, '/Users/me');
  expect(paths.home).toBe('/tmp/x');
  expect(paths.projects).toBe('/tmp/x/projects.json');
  expect(paths.info).toBe('/tmp/x/server-info');
});

test('registering a project twice keeps one entry and moves lastUsedAt', () => {
  const file = machinePaths({ RYUGI_SERVER_HOME: tempHome() }).projects;
  const project = newProject();
  registerProject(file, project, 1000);
  registerProject(file, project, 5000);
  const entries = readProjects(file);
  expect(entries).toEqual([{ dir: project, registeredAt: 1000, lastUsedAt: 5000 }]);
});

test('registering resolves symlinks to the real project path', () => {
  const file = machinePaths({ RYUGI_SERVER_HOME: tempHome() }).projects;
  const project = newProject();
  const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-link-')), 'p');
  fs.symlinkSync(project, link);
  registerProject(file, link, 1);
  expect(readProjects(file).map((entry) => entry.dir)).toEqual([project]);
});

test('touch moves lastUsedAt of a registered project and ignores unknown ones', () => {
  const file = machinePaths({ RYUGI_SERVER_HOME: tempHome() }).projects;
  const project = newProject();
  registerProject(file, project, 1);
  touchProject(file, project, 9);
  touchProject(file, newProject(), 9);
  expect(readProjects(file)).toEqual([{ dir: project, registeredAt: 1, lastUsedAt: 9 }]);
});

test('remove drops the project from the registry', () => {
  const file = machinePaths({ RYUGI_SERVER_HOME: tempHome() }).projects;
  const a = newProject();
  const b = newProject();
  registerProject(file, a, 1);
  registerProject(file, b, 2);
  removeProject(file, a);
  expect(readProjects(file).map((entry) => entry.dir)).toEqual([b]);
});

test('prune drops projects whose directory or .ryugi/artifacts is gone', () => {
  const file = machinePaths({ RYUGI_SERVER_HOME: tempHome() }).projects;
  const kept = newProject();
  const gone = newProject();
  const emptied = newProject();
  registerProject(file, kept, 1);
  registerProject(file, gone, 1);
  registerProject(file, emptied, 1);
  fs.rmSync(gone, { recursive: true });
  fs.rmSync(path.join(emptied, '.ryugi'), { recursive: true });
  expect(pruneProjects(file).map((entry) => entry.dir)).toEqual([kept]);
  expect(readProjects(file).map((entry) => entry.dir)).toEqual([kept]);
});

test('a project is dormant once unused for more than seven days', () => {
  const entry = { dir: '/p', registeredAt: 0, lastUsedAt: 0 };
  expect(DORMANT_AFTER_MS).toBe(7 * 24 * 60 * 60 * 1000);
  expect(isDormant(entry, DORMANT_AFTER_MS)).toBe(false);
  expect(isDormant(entry, DORMANT_AFTER_MS + 1)).toBe(true);
});

test('the registry is private: 0700 home and 0600 file', () => {
  const home = tempHome();
  const file = machinePaths({ RYUGI_SERVER_HOME: home }).projects;
  registerProject(file, newProject(), 1);
  expect(fs.statSync(home).mode & 0o777).toBe(0o700);
  expect(fs.statSync(file).mode & 0o777).toBe(0o600);
});

test('a corrupt registry reads as empty', () => {
  const file = machinePaths({ RYUGI_SERVER_HOME: tempHome() }).projects;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not json');
  expect(readProjects(file)).toEqual([]);
});
