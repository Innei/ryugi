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

  test('a browser address, nanoid or legacy hex, is a local route', () => {
    for (const id of ['V1StGXR8_Z5jdHi6B-myT', '0123456789abcdef0123456789abcdef']) {
      expect(parseRoute(`/html/${id}`)).toEqual({ kind: 'artifact', type: 'html', id });
      expect(parseRoute(`/preview/document/${id}/`)).toEqual({ kind: 'preview', type: 'document', id });
    }
  });

  test('cloud links are not local routes', () => {
    for (const pathname of ['/a/V1StGXR8_Z5jdHi6B-myT', '/a/V1StGXR8_Z5jdHi6B-myT/view', '/a/V1StGXR8_Z5jdHi6B-myT/preview', '/overview', '/account', '/innei']) {
      expect(parseRoute(pathname), pathname).toEqual({ kind: 'unknown' });
    }
  });

  test('a preview route names a valid local artifact', () => {
    expect(parseRoute('/preview/artboard/header')).toEqual({ kind: 'preview', type: 'artboard', id: 'header' });
    expect(parseRoute('/preview/document/spec/')).toEqual({ kind: 'preview', type: 'document', id: 'spec' });
    for (const pathname of ['/preview/slides/deck', '/preview/html/Bad', '/preview/html/x/y']) {
      expect(parseRoute(pathname)).toEqual({ kind: 'unknown' });
    }
  });

  test('unknown types, invalid ids and deeper paths are unknown', () => {
    for (const pathname of ['/slides/deck', '/html/../x', '/html/Bad', '/html/a/b', '/html', '/html/']) {
      expect(parseRoute(pathname), pathname).toEqual({ kind: 'unknown' });
    }
  });
});
