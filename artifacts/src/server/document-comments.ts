import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { applyAgentOp, applyHumanOp, emptyComments, mergeComments, parseComments, savedComments, type AgentOp, type CommentsFile, type HumanOp } from '../shared/comments';
import type { CommentNames } from './comment-names';
import { writeJsonAtomic } from './state';

const MAX_TEXT = 20000;

const isText = (value: unknown, max = MAX_TEXT): value is string => typeof value === 'string' && value.length <= max;
const isId = (value: unknown): value is string => isText(value, 100) && value.length > 0;

export function asHumanOp(value: unknown): HumanOp | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  switch (v.op) {
    case 'create':
      return isId(v.blockId) && isText(v.quote) && isText(v.text) && v.text.length > 0
        ? { op: 'create', blockId: v.blockId, quote: v.quote, text: v.text }
        : null;
    case 'reply':
      return isId(v.threadId) && isText(v.text) && v.text.length > 0 ? { op: 'reply', threadId: v.threadId, text: v.text } : null;
    case 'edit':
      return isId(v.threadId) && isId(v.messageId) && isText(v.text) && v.text.length > 0
        ? { op: 'edit', threadId: v.threadId, messageId: v.messageId, text: v.text }
        : null;
    case 'delete':
      return isId(v.threadId) && isId(v.messageId) ? { op: 'delete', threadId: v.threadId, messageId: v.messageId } : null;
    case 'resolve':
    case 'reopen':
      return isId(v.threadId) ? { op: v.op, threadId: v.threadId } : null;
    default:
      return null;
  }
}

export function asAgentOp(value: unknown): AgentOp | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  switch (v.op) {
    case 'add':
      return isId(v.blockId) && (v.quote === undefined || isText(v.quote)) && isText(v.text) && v.text.length > 0
        ? { op: 'add', blockId: v.blockId, quote: (v.quote as string | undefined) ?? '', text: v.text }
        : null;
    case 'reply':
      return isId(v.threadId) && isText(v.text) && v.text.length > 0 ? { op: 'reply', threadId: v.threadId, text: v.text } : null;
    case 'resolve':
      return isId(v.threadId) ? { op: 'resolve', threadId: v.threadId } : null;
    default:
      return null;
  }
}

export interface CommentStore {
  current(): CommentsFile;
  warnings(): string[];
  sync(): boolean;
  apply(op: HumanOp): CommentsFile;
  applyAgent(op: AgentOp, name?: string): { file: CommentsFile; threadId: string; messageId?: string };
}

const noNames: CommentNames = { human: () => undefined, agent: () => undefined };

export function createCommentStore(
  file: string,
  names = noNames,
  now = () => new Date().toISOString(),
  newId = () => nanoid(10),
): CommentStore {
  let current = emptyComments();
  let lastSeen: string | null = null;
  let warnings: string[] = [];
  let loaded = false;

  const write = () => {
    writeJsonAtomic(file, current);
    lastSeen = fs.readFileSync(file, 'utf8');
  };

  const sync = () => {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return false;
    }
    if (text === lastSeen) return false;
    lastSeen = text;
    try {
      const incoming = parseComments(text);
      const base = loaded ? current : savedComments(incoming);
      const merged = mergeComments(base, incoming, 'agent', now(), newId, names.agent());
      current = merged.file;
      warnings = merged.warnings;
      if (`${JSON.stringify(current, null, 2)}\n` !== text) write();
    } catch (err) {
      warnings = [`comments.json is not valid: ${(err as Error).message} (left as written; fix it)`];
    }
    return true;
  };

  sync();
  loaded = true;
  return {
    current: () => current,
    warnings: () => warnings,
    sync,
    apply: (op) => {
      sync();
      current = applyHumanOp(current, op, now(), newId, names.human());
      write();
      return current;
    },
    applyAgent: (op, name) => {
      sync();
      const result = applyAgentOp(current, op, now(), newId, name ?? names.agent());
      current = result.file;
      write();
      return result;
    },
  };
}
