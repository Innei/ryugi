import { describe, expect, test } from 'vitest';
import { parseRoute } from '../src/viewer/lib/route';

describe('parseRoute', () => {
  test('the root is the artifact list', () => {
    expect(parseRoute('/')).toEqual({ kind: 'list' });
    expect(parseRoute('/index.html')).toEqual({ kind: 'list' });
  });

  test('a cloud preview path opens the thumbnail view', () => {
    expect(parseRoute('/a/V1StGXR8_Z5jdHi6B-myT/preview')).toEqual({ kind: 'cloud-preview', id: 'V1StGXR8_Z5jdHi6B-myT' });
  });

  test('on the cloud host the root is the signed-in cloud list', () => {
    expect(parseRoute('/', true)).toEqual({ kind: 'cloud-list' });
    expect(parseRoute('/a/abc', true)).toEqual({ kind: 'cloud', id: 'abc' });
  });

  test('an artifact link names its type and id, with or without a trailing slash', () => {
    expect(parseRoute('/html/arrow-tuner')).toEqual({ kind: 'artifact', type: 'html', id: 'arrow-tuner' });
    expect(parseRoute('/artboard/header/')).toEqual({ kind: 'artifact', type: 'artboard', id: 'header' });
  });

  test('a cloud link opens the shell, and its view path opens the framed view', () => {
    expect(parseRoute('/a/V1StGXR8_Z5jdHi6B-myT')).toEqual({ kind: 'cloud', id: 'V1StGXR8_Z5jdHi6B-myT' });
    expect(parseRoute('/a/V1StGXR8_Z5jdHi6B-myT/view')).toEqual({ kind: 'cloud-view', id: 'V1StGXR8_Z5jdHi6B-myT' });
    expect(parseRoute('/a/V1StGXR8_Z5jdHi6B-myT/view/')).toEqual({ kind: 'cloud-view', id: 'V1StGXR8_Z5jdHi6B-myT' });
    for (const pathname of ['/a/', '/a/x/y', '/a/x/view/y', '/a/bad%20id', '/a/../x']) {
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
