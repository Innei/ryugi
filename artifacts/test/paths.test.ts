import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { resolveInside } from '../src/server/paths';

const root = path.resolve('/srv/board');

describe('resolveInside', () => {
  test('resolves a relative file under the root', () => {
    expect(resolveInside(root, 'pages/p/a.html')).toBe(path.join(root, 'pages/p/a.html'));
  });

  test('rejects parent traversal', () => {
    expect(resolveInside(root, '../secret.txt')).toBeNull();
    expect(resolveInside(root, 'pages/../../secret.txt')).toBeNull();
  });

  test('treats an absolute-looking path as relative to the root', () => {
    expect(resolveInside(root, '/etc/passwd')).toBe(path.join(root, 'etc/passwd'));
  });

  test('rejects a sibling directory that shares the root prefix', () => {
    expect(resolveInside(root, '../board-other/x.html')).toBeNull();
  });

  test('rejects any path segment starting with a dot, whatever the case', () => {
    expect(resolveInside(root, '.state/server-info')).toBeNull();
    expect(resolveInside(root, '.State/.last-token')).toBeNull();
    expect(resolveInside(root, 'pages/.hidden/a.html')).toBeNull();
  });
});
