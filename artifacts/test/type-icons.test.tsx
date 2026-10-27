// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test } from 'vitest';
import { ARTIFACT_TYPES } from '../src/shared/types';
import { TYPE_GLYPHS, typeFaviconHref } from '../src/shared/type-icons';
import { TypeIcon } from '../src/viewer/components/TypeIcon';
import { useTypeFavicon } from '../src/viewer/hooks/useTypeFavicon';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const svgOf = (href: string) => {
  expect(href.startsWith('data:image/svg+xml,')).toBe(true);
  return decodeURIComponent(href.slice('data:image/svg+xml,'.length));
};

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

test('each artifact type has its own favicon drawn in the brand color on a tinted tile', () => {
  const svgs = ARTIFACT_TYPES.map((type) => svgOf(typeFaviconHref(type)));
  expect(new Set(svgs).size).toBe(ARTIFACT_TYPES.length);
  ARTIFACT_TYPES.forEach((type, i) => {
    expect(svgs[i]).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svgs[i]!.toLowerCase()).toContain('#c65d3b');
    expect(svgs[i]).toContain(TYPE_GLYPHS[type].stroke);
  });
});

test('the in-app type icon draws the same glyph in the surrounding text color', () => {
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  act(() => root.render(createElement(TypeIcon, { type: 'document', size: 14 })));
  const svg = host.querySelector('svg')!;
  expect(svg.getAttribute('width')).toBe('14');
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect([...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toContain(
    TYPE_GLYPHS.document.stroke,
  );
  expect(svg.innerHTML).not.toContain('#c65d3b');
  act(() => root.unmount());
});

test('an open artifact shows its type favicon and the app icon returns when it closes', () => {
  const link = document.head.appendChild(document.createElement('link'));
  link.rel = 'icon';
  link.href = '/app-icon.svg';
  const appIcon = link.href;
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  const Page = ({ type }: { type: 'artboard' | 'html' }) => {
    useTypeFavicon(type);
    return null;
  };
  act(() => root.render(createElement(Page, { type: 'artboard' })));
  expect(link.href).toBe(typeFaviconHref('artboard'));
  act(() => root.render(createElement(Page, { type: 'html' })));
  expect(link.href).toBe(typeFaviconHref('html'));
  act(() => root.unmount());
  expect(link.href).toBe(appIcon);
});
