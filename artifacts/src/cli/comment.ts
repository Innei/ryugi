import fs from 'node:fs';
import { detectAgent } from '../server/agent';
import { CliError, invocation } from './paths';
import { serverClient } from './server';
import type { Emit } from './start';

export const COMMENT_ACTIONS = ['list', 'add', 'reply', 'resolve'] as const;
export type CommentAction = (typeof COMMENT_ACTIONS)[number];

export interface CommentOptions {
  projectDir: string;
  action: string | undefined;
  artifact?: string;
  all?: boolean;
  block?: string;
  quote?: string;
  thread?: string;
  text?: string;
}

const DOCUMENT = /^document\/[a-z0-9][a-z0-9-]*$/;
const WRITTEN = { add: 'comment-added', reply: 'comment-replied', resolve: 'comment-resolved' } as const;

function readStdin(): string {
  if (process.stdin.isTTY) return '';
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function messageText(options: CommentOptions): string {
  const text = (options.text ?? readStdin()).trim();
  if (!text) throw new CliError('The message is empty: pass --text <text> or pipe it on stdin');
  return text;
}

function requestOf(options: CommentOptions, action: CommentAction): Record<string, unknown> {
  if (action === 'list') return { op: 'list', all: !!options.all };
  if (action === 'add') {
    if (!options.block) throw new CliError('comment add needs --block <blockId>');
    return { op: 'add', blockId: options.block, ...(options.quote ? { quote: options.quote } : {}), text: messageText(options) };
  }
  if (!options.thread) throw new CliError(`comment ${action} needs --thread <threadId>`);
  return action === 'reply' ? { op: 'reply', threadId: options.thread, text: messageText(options) } : { op: 'resolve', threadId: options.thread };
}

export async function comment(options: CommentOptions, emit: Emit): Promise<number> {
  const action = COMMENT_ACTIONS.find((name) => name === options.action);
  if (!action) throw new CliError('comment needs an action: list, add, reply or resolve');
  if (!options.artifact || !DOCUMENT.test(options.artifact)) throw new CliError('--artifact must be document/<id>');
  const request = requestOf(options, action);
  const server = serverClient(options.projectDir);
  const agent = detectAgent(process.env);
  const id = options.artifact.slice('document/'.length);
  const { status, json } = await server.call('POST', `/api/agent/document/${id}/comments`, { ...request, ...(agent ? { agent } : {}) });
  if (status === 404 && typeof json.error !== 'string') {
    throw new CliError(`The running artifacts server is older than this CLI. Run \`${invocation()} start --project-dir ${server.project}\` to replace it, then run this again.`);
  }
  if (status < 200 || status >= 300) throw new CliError(json.error || `HTTP ${status}`);
  if (action === 'list') emit({ type: 'comments', artifact: options.artifact, threads: json.threads, ...(options.all ? { all: true } : {}) });
  else emit({ type: WRITTEN[action], artifact: options.artifact, threadId: json.threadId, ...(json.messageId ? { messageId: json.messageId } : {}) });
  return 0;
}

interface ListedMessage {
  author: string;
  name?: string;
  text: string;
  deleted?: boolean;
}

interface ListedThread {
  id: string;
  status: string;
  anchor: { blockId: string; quote: string };
  waitingOn: string | null;
  changes?: string[];
  messages: ListedMessage[];
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);

function threadText(thread: ListedThread) {
  const state = [thread.status, thread.waitingOn ? `waiting on ${thread.waitingOn}` : '', thread.changes?.length ? thread.changes.join(', ') : ''].filter(Boolean).join(' · ');
  const lines = [`thread ${thread.id} (${state})`, `  on block ${thread.anchor.blockId}${thread.anchor.quote ? ` "${clip(thread.anchor.quote, 120)}"` : ''}`];
  for (const message of thread.messages) {
    const who = message.name ? `${message.author} (${message.name})` : message.author;
    lines.push(`  ${who}: ${message.deleted ? '[deleted]' : message.text.replace(/\n/g, '\n    ')}`);
  }
  return lines.join('\n');
}

export function commentText(value: Record<string, unknown>): string | null {
  if (value.type === 'comments') {
    const threads = (value.threads as ListedThread[] | undefined) ?? [];
    if (!threads.length) return value.all ? `No comments on ${value.artifact}.` : `No new comments on ${value.artifact}.`;
    return threads.map(threadText).join('\n\n');
  }
  if (value.type === 'comment-added') return `Added thread ${value.threadId} (message ${value.messageId})`;
  if (value.type === 'comment-replied') return `Replied in thread ${value.threadId} (message ${value.messageId})`;
  if (value.type === 'comment-resolved') return `Resolved thread ${value.threadId}`;
  return null;
}
