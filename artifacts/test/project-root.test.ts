import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from 'vitest';

import { projectPaths } from '../src/cli/paths';

function tree(...dirs: string[]) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'artifacts-root-')));
  for (const dir of dirs) fs.mkdirSync(path.join(base, dir), { recursive: true });
  return base;
}

test('a subdirectory of a git repository resolves to the repository root', () => {
  const base = tree('.git', 'packages/app/src');
  const paths = projectPaths(path.join(base, 'packages/app/src'));
  expect(paths.project).toBe(base);
  expect(paths.root).toBe(path.join(base, '.ryugi', 'artifacts'));
});

test('the nearest directory with saved artifacts wins below the repository root', () => {
  const base = tree('.git', 'packages/app/.ryugi/artifacts', 'packages/app/src');
  expect(projectPaths(path.join(base, 'packages/app/src')).project).toBe(
    path.join(base, 'packages/app'),
  );
});

test('a git worktree, whose .git is a file, is its own project', () => {
  const base = tree('.git', 'worktrees/feature/src');
  fs.writeFileSync(
    path.join(base, 'worktrees/feature/.git'),
    'gitdir: ../../.git/worktrees/feature\n',
  );
  expect(projectPaths(path.join(base, 'worktrees/feature/src')).project).toBe(
    path.join(base, 'worktrees/feature'),
  );
});

test('outside any git repository the directory itself is the project', () => {
  const base = tree('.ryugi/artifacts', 'loose/dir');
  expect(projectPaths(path.join(base, 'loose/dir')).project).toBe(path.join(base, 'loose/dir'));
});

test('saved artifacts above the repository root are ignored', () => {
  const base = tree('.ryugi/artifacts', 'repo/.git', 'repo/src');
  expect(projectPaths(path.join(base, 'repo/src')).project).toBe(path.join(base, 'repo'));
});

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete process.env[key];
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('a home directory that is a git repository does not swallow the folders under it', () => {
  const home = tree('.git', 'Desktop/demo');
  withEnv({ HOME: home }, () => {
    expect(projectPaths(path.join(home, 'Desktop/demo')).project).toBe(
      path.join(home, 'Desktop/demo'),
    );
    expect(projectPaths(home).project).toBe(home);
  });
});

test('an older launcher, whose hooks read the given directory, gets the directory unresolved', () => {
  const base = tree('.git', 'packages/app');
  const app = path.join(base, 'packages/app');
  withEnv(
    {
      RYUGI_ARTIFACTS_COMMAND: 'node "/old/ryugi-artifacts.cjs"',
      RYUGI_ARTIFACTS_RESOLVE_ROOT: undefined,
    },
    () => {
      expect(projectPaths(app).project).toBe(app);
    },
  );
  withEnv(
    {
      RYUGI_ARTIFACTS_COMMAND: 'node "/new/ryugi-artifacts.cjs"',
      RYUGI_ARTIFACTS_RESOLVE_ROOT: '1',
    },
    () => {
      expect(projectPaths(app).project).toBe(base);
    },
  );
});
