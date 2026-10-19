import { createDefaultRegistry, deserializeFromXml, serializeToXml } from '@haklex/rich-litexml';
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import { nanoid } from 'nanoid';
import { stripOpaque, TAG, unbalancedTag } from './balance';

type Block = SerializedLexicalNode & { $?: { blockId?: string }; children?: Block[]; text?: string };

const BLOCK_TAGS = [
  'doc',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'ul',
  'ol',
  'li',
  'table',
  'tr',
  'th',
  'td',
  'hr',
  'img',
  'codeblock',
  'mermaid',
  'excalidraw',
  'chart',
  'math',
  'alert',
];
const INLINE_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'del', 'strike', 'code', 'sub', 'sup', 'mark', 'a', 'br'];
export const DOCUMENT_TAGS = new Set([...BLOCK_TAGS, ...INLINE_TAGS]);

const LITEXML_ONLY_TAGS = new Set([
  'agent-diff',
  'attachment',
  'banner',
  'chat',
  'code-snippet',
  'comment',
  'details',
  'dynamic',
  'embed',
  'footnote',
  'footnote-section',
  'gallery',
  'grid',
  'link-card',
  'mention',
  'nested-doc',
  'poll',
  'ruby',
  'spoiler',
  'tag',
  'video',
]);

const registry = createDefaultRegistry();

export class DocumentRejected extends Error {}

function unsupportedTag(xml: string): string | null {
  for (const match of stripOpaque(xml).matchAll(TAG)) {
    const name = match[2]!.toLowerCase();
    if (DOCUMENT_TAGS.has(name)) continue;
    if (LITEXML_ONLY_TAGS.has(name)) return `<${name}> is not supported in documents`;
    return `<${name}> is not a LiteXML tag`;
  }
  return null;
}

export function parseDocument(xml: string): SerializedEditorState {
  const wrapped = /^\s*<doc[\s>]/.test(xml) ? xml : `<doc>${xml}</doc>`;
  const problem = unbalancedTag(wrapped) ?? unsupportedTag(wrapped);
  if (problem) throw new DocumentRejected(problem);
  try {
    return deserializeFromXml(wrapped, registry);
  } catch (err) {
    throw new DocumentRejected((err as Error).message);
  }
}

export const serializeDocument = (state: SerializedEditorState) => `${serializeToXml(state, registry, { compact: false })}\n`;

export function stampBlockIds(state: SerializedEditorState): SerializedEditorState {
  const seen = new Set<string>();
  const children = (state.root.children as Block[]).map((block) => {
    const id = block.$?.blockId;
    if (id && !seen.has(id)) {
      seen.add(id);
      return block;
    }
    let fresh = nanoid(8);
    while (seen.has(fresh)) fresh = nanoid(8);
    seen.add(fresh);
    return { ...block, $: { ...block.$, blockId: fresh } };
  });
  return { ...state, root: { ...state.root, children } };
}

const textOf = (node: Block): string => node.text ?? (node.children ?? []).map(textOf).join('');

export function documentTitle(state: SerializedEditorState): string | null {
  const heading = (state.root.children as Block[]).find((block) => block.type === 'heading');
  return heading ? textOf(heading).trim() || null : null;
}
