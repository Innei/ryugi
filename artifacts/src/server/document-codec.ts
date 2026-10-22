import { createDefaultRegistry, deserializeFromXml, serializeToXml } from '@haklex/rich-litexml';
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical';
import { nanoid } from 'nanoid';
import { DYNAMIC_URL } from '../shared/dynamic';
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
  'details',
  'footnote-section',
  'def',
  'dynamic',
  'pending',
];
const INLINE_TAGS = ['b', 'strong', 'i', 'em', 'u', 's', 'del', 'strike', 'code', 'sub', 'sup', 'mark', 'a', 'br', 'footnote'];
export const DOCUMENT_TAGS = new Set([...BLOCK_TAGS, ...INLINE_TAGS]);

const LITEXML_ONLY_TAGS = new Set([
  'agent-diff',
  'attachment',
  'banner',
  'chat',
  'code-snippet',
  'comment',
  'embed',
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
registry.registerReader('pending', (el) => {
  const id = el.getAttribute('id');
  return { type: 'pending', ...(id ? { $: { blockId: id } } : {}), intent: el.getAttribute('intent') ?? '', version: 1 } as SerializedLexicalNode;
});
registry.registerWriter('pending', (node) => {
  const { $: state, intent } = node as Block & { intent?: string };
  return { tag: 'pending', attrs: { ...(state?.blockId ? { id: state.blockId } : {}), intent: intent ?? '' }, selfClosing: true };
});

export class DocumentRejected extends Error {}

export const URL_ATTR = /\surl\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const DYNAMIC_BODY = /<dynamic\b[^>]*?(?<!\/)>([\s\S]*?)<\/dynamic>/gi;
const FOOTNOTE_SECTION = /<footnote-section\b[\s\S]*?<\/footnote-section>/gi;
const DEF_TAG = /<def[\s>/]/i;
const CDATA_BODY = /^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/;

function unsupportedTag(xml: string): string | null {
  for (const match of stripOpaque(xml).matchAll(TAG)) {
    const name = match[2]!.toLowerCase();
    if (DOCUMENT_TAGS.has(name)) continue;
    if (LITEXML_ONLY_TAGS.has(name)) return `<${name}> is not supported in documents`;
    return `<${name}> is not a LiteXML tag`;
  }
  return null;
}

function strayDef(xml: string): string | null {
  return DEF_TAG.test(stripOpaque(xml).replace(FOOTNOTE_SECTION, '')) ? '<def> belongs inside <footnote-section>' : null;
}

function badDynamicProps(xml: string): string | null {
  for (const match of xml.matchAll(DYNAMIC_BODY)) {
    const body = match[1]!;
    const raw = (CDATA_BODY.exec(body)?.[1] ?? body).trim();
    if (!raw) continue;
    try {
      const props: unknown = JSON.parse(raw);
      if (props && typeof props === 'object' && !Array.isArray(props)) continue;
    } catch {}
    return '<dynamic> props must be a JSON object';
  }
  return null;
}

function containsPending(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPending);
  if (!value || typeof value !== 'object') return false;
  return (value as { type?: unknown }).type === 'pending' || Object.values(value).some(containsPending);
}

const nestedPending = (blocks: Block[]) =>
  blocks.some((block) => block.type !== 'pending' && containsPending(block)) ? '<pending> must be a top-level block' : null;

function badDynamicUrl(nodes: Block[]): string | null {
  for (const node of nodes) {
    if (node.type === 'dynamic' && !DYNAMIC_URL.test((node as { url?: string }).url ?? '')) return '<dynamic> url must be assets/<name>.html';
    const nested = badDynamicUrl(node.children ?? []);
    if (nested) return nested;
  }
  return null;
}

export function parseDocument(xml: string): SerializedEditorState {
  const wrapped = /^\s*<doc[\s>]/.test(xml) ? xml : `<doc>${xml}</doc>`;
  const problem = unbalancedTag(wrapped) ?? unsupportedTag(wrapped) ?? strayDef(wrapped) ?? badDynamicProps(wrapped);
  if (problem) throw new DocumentRejected(problem);
  let state: SerializedEditorState;
  try {
    state = deserializeFromXml(wrapped, registry);
  } catch (err) {
    throw new DocumentRejected((err as Error).message);
  }
  const url = badDynamicUrl(state.root.children as Block[]) ?? nestedPending(state.root.children as Block[]);
  if (url) throw new DocumentRejected(url);
  return state;
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
