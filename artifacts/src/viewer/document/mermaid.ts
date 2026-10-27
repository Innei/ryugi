import { renderMermaid } from '@haklex/rich-renderer-mermaid/utils';
import { useMemo } from 'react';

export interface MermaidDiagram {
  src: string;
  width: number;
  height: number;
  type: string;
  background: string;
}

const BACKGROUND = { light: '#ffffff', dark: '#171717' };

const toDataUrl = (svg: string) => {
  let binary = '';
  for (const byte of new TextEncoder().encode(svg)) binary += String.fromCodePoint(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
};

export function useMermaidDiagram(
  content: string,
  colorScheme: 'light' | 'dark',
): MermaidDiagram | null {
  return useMemo(() => {
    if (!content.trim()) return null;
    try {
      const { svg, width, height, mermaidType } = renderMermaid(content, colorScheme);
      return {
        src: toDataUrl(svg),
        width,
        height,
        type: String(mermaidType),
        background: BACKGROUND[colorScheme],
      };
    } catch {
      return null;
    }
  }, [content, colorScheme]);
}

export function headingAbove(node: HTMLElement | null): string | null {
  let block = node;
  while (block?.parentElement && !block.parentElement.hasAttribute('data-lexical-editor'))
    block = block.parentElement;
  if (!block?.parentElement) return null;
  for (
    let sibling = block.previousElementSibling;
    sibling;
    sibling = sibling.previousElementSibling
  ) {
    if (/^H[1-6]$/.test(sibling.tagName)) return sibling.textContent?.trim() || null;
  }
  return null;
}
