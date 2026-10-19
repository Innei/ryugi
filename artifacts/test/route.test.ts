import { describe, expect, test } from 'vitest';
import { parseRoute } from '../src/viewer/lib/route';

describe('parseRoute', () => {
  test('the root is the artifact list', () => {
    expect(parseRoute('/')).toEqual({ kind: 'list' });
    expect(parseRoute('/index.html')).toEqual({ kind: 'list' });
  });

  test('an artifact link names its type and id, with or without a trailing slash', () => {
    expect(parseRoute('/html/arrow-tuner')).toEqual({ kind: 'artifact', type: 'html', id: 'arrow-tuner' });
    expect(parseRoute('/artboard/header/')).toEqual({ kind: 'artifact', type: 'artboard', id: 'header' });
  });

  test('unknown types, invalid ids and deeper paths are unknown', () => {
    for (const pathname of ['/slides/deck', '/html/../x', '/html/Bad', '/html/a/b', '/html', '/html/']) {
      expect(parseRoute(pathname), pathname).toEqual({ kind: 'unknown' });
    }
  });
});
