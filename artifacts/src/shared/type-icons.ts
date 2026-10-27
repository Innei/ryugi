import type { ArtifactType } from './types';

export const TYPE_ICON_VIEWBOX = '0 0 24 24';

export const TYPE_GLYPHS: Record<ArtifactType, { fill: string; stroke: string }> = {
  artboard: {
    fill: 'M9.3 9a1.3 1.3 0 1 1-2.6 0a1.3 1.3 0 1 1 2.6 0z M13.3 7a1.3 1.3 0 1 1-2.6 0a1.3 1.3 0 1 1 2.6 0z M17.3 9.5a1.3 1.3 0 1 1-2.6 0a1.3 1.3 0 1 1 2.6 0z M8.8 13a1.3 1.3 0 1 1-2.6 0a1.3 1.3 0 1 1 2.6 0z',
    stroke:
      'M12 3.5c-5 0-8.5 3.8-8.5 8.5s3.6 8.5 7.6 8.5c1.2 0 1.6-.8 1.6-1.9v-1.3c0-1.3 1-2.3 2.3-2.3h2.3c2.2 0 3.7-1.5 3.7-3.6 0-4.4-4-7.9-9-7.9z',
  },
  document: {
    fill: '',
    stroke:
      'M7 3h10a2.5 2.5 0 0 1 2.5 2.5v13a2.5 2.5 0 0 1-2.5 2.5H7a2.5 2.5 0 0 1-2.5-2.5v-13A2.5 2.5 0 0 1 7 3z M8.5 8.5h7M8.5 12h7M8.5 15.5h4',
  },
  html: {
    fill: '',
    stroke: 'M8 7.5 3.5 12 8 16.5M16 7.5l4.5 4.5-4.5 4.5M13.5 5.5l-3 13',
  },
};

const INK = '#C65D3B';
const TINT = '#FBEDE6';

export function typeFaviconHref(type: ArtifactType): string {
  const { fill, stroke } = TYPE_GLYPHS[type];
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 28 28">',
    `<rect x="-2" y="-2" width="28" height="28" rx="6" fill="${TINT}"/>`,
    fill && `<path d="${fill}" fill="${INK}"/>`,
    `<path d="${stroke}" fill="none" stroke="${INK}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</svg>',
  ].join('');
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
