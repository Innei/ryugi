// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, expect, test } from 'vitest';
import { ArtifactThumbnail } from '../src/viewer/components/ArtifactThumbnail';

let root: Root;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (src: string | null | undefined) => act(() => root.render(createElement(ArtifactThumbnail, { src, type: 'artboard' })));

test('a thumbnail is one lazily decoded image over the type icon, never a frame', () => {
  render('/api/thumbnail/artboard/ideas.svg?v=1');
  const image = host.querySelector('img')!;
  expect(image.getAttribute('src')).toBe('/api/thumbnail/artboard/ideas.svg?v=1');
  expect(image.getAttribute('loading')).toBe('lazy');
  expect(image.getAttribute('decoding')).toBe('async');
  expect(image.getAttribute('width')).toBe('600');
  expect(image.getAttribute('height')).toBe('360');
  expect(host.querySelector('svg')).not.toBeNull();
  expect(host.querySelector('iframe')).toBeNull();
});

test('a failed image leaves the type icon, and a new version tries again', () => {
  render('/api/thumbnail/artboard/ideas.svg?v=1');
  act(() => host.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('svg')).not.toBeNull();
  render('/api/thumbnail/artboard/ideas.svg?v=2');
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/api/thumbnail/artboard/ideas.svg?v=2');
});

test('without a source only the type icon shows', () => {
  render(null);
  expect(host.querySelector('img')).toBeNull();
  expect(host.querySelector('svg')).not.toBeNull();
});
