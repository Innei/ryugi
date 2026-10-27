import fs from 'node:fs';
import { detectAgent } from '../server/agent';
import type { CommandSpec } from './command';
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
  board?: string;
  x?: string;
  y?: string;
}

const ARTIFACT = /^(document|artboard)\/[a-z0-9][a-z0-9-]*$/;
const WRITTEN = {
  add: 'comment-added',
  reply: 'comment-replied',
  resolve: 'comment-resolved',
} as const;

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

function coordinate(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new CliError(`${flag} must be a number`);
  return number;
}

function requestOf(
  options: CommentOptions,
  action: CommentAction,
  type: string,
): Record<string, unknown> {
  if (action === 'list') return { op: 'list', all: !!options.all };
  if (action === 'add' && type === 'artboard') {
    if (!options.board) throw new CliError('comment add on an artboard needs --board <boardId>');
    const x = coordinate(options.x, '--x');
    const y = coordinate(options.y, '--y');
    return {
      op: 'add',
      board: options.board,
      ...(x !== undefined ? { x } : {}),
      ...(y !== undefined ? { y } : {}),
      text: messageText(options),
    };
  }
  if (action === 'add') {
    if (!options.block) throw new CliError('comment add needs --block <blockId>');
    return {
      op: 'add',
      blockId: options.block,
      ...(options.quote ? { quote: options.quote } : {}),
      text: messageText(options),
    };
  }
  if (!options.thread) throw new CliError(`comment ${action} needs --thread <threadId>`);
  return action === 'reply'
    ? { op: 'reply', threadId: options.thread, text: messageText(options) }
    : { op: 'resolve', threadId: options.thread };
}

export async function comment(options: CommentOptions, emit: Emit): Promise<number> {
  const action = COMMENT_ACTIONS.find((name) => name === options.action);
  if (!action) throw new CliError('comment needs an action: list, add, reply or resolve');
  if (!options.artifact || !ARTIFACT.test(options.artifact))
    throw new CliError('--artifact must be document/<id> or artboard/<id>');
  const [type, id] = options.artifact.split('/') as [string, string];
  const request = requestOf(options, action, type);
  const server = serverClient(options.projectDir);
  const agent = detectAgent(process.env);
  const { status, json } = await server.call('POST', `/api/agent/${type}/${id}/comments`, {
    ...request,
    ...(agent ? { agent } : {}),
  });
  if (status === 404 && typeof json.error !== 'string') {
    throw new CliError(
      `The running artifacts server is older than this CLI. Run \`${invocation()} start --project-dir ${server.project}\` to replace it, then run this again.`,
    );
  }
  if (status < 200 || status >= 300) throw new CliError(json.error || `HTTP ${status}`);
  if (action === 'list')
    emit({
      type: 'comments',
      artifact: options.artifact,
      threads: json.threads,
      ...(json.groups ? { groups: json.groups } : {}),
      ...(options.all ? { all: true } : {}),
    });
  else
    emit({
      type: WRITTEN[action],
      artifact: options.artifact,
      threadId: json.threadId,
      ...(json.messageId ? { messageId: json.messageId } : {}),
    });
  return 0;
}

interface ListedMessage {
  author: string;
  name?: string;
  text: string;
  deleted?: boolean;
}

interface ListedBoardAnchor {
  page: string;
  board?: string;
  x: number;
  y: number;
  nodes?: { board: string; path: string }[];
  offset?: { x: number; y: number };
}

interface ListedThread {
  id: string;
  status: string;
  anchor: { blockId: string; quote: string } | ListedBoardAnchor;
  waitingOn: string | null;
  changes?: string[];
  stale?: boolean;
  files?: Record<string, string>;
  messages: ListedMessage[];
}

interface ListedGroup {
  id: string;
  title?: string;
  verdict: 'pending' | 'pass' | 'reject';
  evidenceUpdated: boolean;
  rejectThreads: number;
}

const VERDICT_TEXT = { pass: 'passed', reject: 'rejected', pending: 'waiting for a verdict' };
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function groupText(group: ListedGroup) {
  const parts = [
    VERDICT_TEXT[group.verdict],
    group.evidenceUpdated ? 'evidence replaced since the last verdict' : '',
    group.rejectThreads ? `${plural(group.rejectThreads, 'open reject thread')}` : '',
  ];
  return `  ${group.id}${group.title ? ` (${group.title})` : ''}: ${parts.filter(Boolean).join(' · ')}`;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
const percent = (value: number) => `${Math.round(value * 100)}%`;

function anchorLines(thread: ListedThread): string[] {
  const anchor = thread.anchor;
  if ('blockId' in anchor)
    return [`  on block ${anchor.blockId}${anchor.quote ? ` "${clip(anchor.quote, 120)}"` : ''}`];
  const file = anchor.board ? thread.files?.[anchor.board] : undefined;
  const where = anchor.board ? `, board ${anchor.board}${file ? ` (${file})` : ''}` : '';
  const lines = [`  on page ${anchor.page}${where} at ${anchor.x},${anchor.y}`];
  anchor.nodes?.forEach((node, index) => {
    const offset =
      index === 0 && anchor.offset
        ? ` at ${percent(anchor.offset.x)}, ${percent(anchor.offset.y)}`
        : '';
    lines.push(`  node ${node.board}: ${node.path}${offset}`);
  });
  if (thread.stale) lines.push('  the board changed since this comment; the node may have moved');
  return lines;
}

function threadText(thread: ListedThread) {
  const state = [
    thread.status,
    thread.waitingOn ? `waiting on ${thread.waitingOn}` : '',
    thread.changes?.length ? thread.changes.join(', ') : '',
    thread.stale ? 'stale' : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const lines = [`thread ${thread.id} (${state})`, ...anchorLines(thread)];
  for (const message of thread.messages) {
    const who = message.name ? `${message.author} (${message.name})` : message.author;
    lines.push(
      `  ${who}: ${message.deleted ? '[deleted]' : message.text.replace(/\n/g, '\n    ')}`,
    );
  }
  return lines.join('\n');
}

export function commentText(value: Record<string, unknown>): string | null {
  if (value.type === 'comments') {
    const threads = (value.threads as ListedThread[] | undefined) ?? [];
    const groups = (value.groups as ListedGroup[] | undefined) ?? [];
    const head = threads.length
      ? threads.map(threadText).join('\n\n')
      : value.all
        ? `No comments on ${value.artifact}.`
        : `No new comments on ${value.artifact}.`;
    return groups.length ? `${head}\n\nVerify groups:\n${groups.map(groupText).join('\n')}` : head;
  }
  if (value.type === 'comment-added')
    return `Added thread ${value.threadId} (message ${value.messageId})`;
  if (value.type === 'comment-replied')
    return `Replied in thread ${value.threadId} (message ${value.messageId})`;
  if (value.type === 'comment-resolved') return `Resolved thread ${value.threadId}`;
  return null;
}

export const commentCommand: CommandSpec = {
  name: 'comment',
  summary: 'Read and answer comments on a document or artboard (needs a running server)',
  usage: [
    'list    --artifact <document|artboard>/<id> [--all]',
    'add     --artifact document/<id> --block <blockId> [--quote <text>] [--text <text>]',
    'add     --artifact artboard/<id> --board <boardId> [--x <px> --y <px>] [--text <text>]',
    'reply   --artifact <document|artboard>/<id> --thread <threadId> [--text <text>]',
    'resolve --artifact <document|artboard>/<id> --thread <threadId>',
  ],
  details:
    'list prints what changed since you last listed. Without --text, add and reply read the message from stdin.',
  options: {
    artifact: { type: 'string', value: '<type>/<id>', help: 'The document or artboard' },
    all: { type: 'boolean', help: 'list: every thread, not only what changed' },
    block: { type: 'string', value: '<blockId>', help: 'add: the document block to comment on' },
    quote: {
      type: 'string',
      value: '<text>',
      help: 'add: the text in the block the comment is about',
    },
    board: { type: 'string', value: '<boardId>', help: 'add: the artboard board to comment on' },
    x: { type: 'string', value: '<px>', help: 'add: horizontal position on the board' },
    y: { type: 'string', value: '<px>', help: 'add: vertical position on the board' },
    thread: { type: 'string', value: '<threadId>', help: 'reply, resolve: the thread' },
    text: { type: 'string', value: '<text>', help: 'add, reply: the message' },
  },
  positionals: 1,
  run: ({ values, positionals, projectDir }, emit) =>
    comment(
      {
        projectDir,
        action: positionals[0],
        artifact: values.artifact as string | undefined,
        all: values.all as boolean | undefined,
        block: values.block as string | undefined,
        quote: values.quote as string | undefined,
        thread: values.thread as string | undefined,
        text: values.text as string | undefined,
        board: values.board as string | undefined,
        x: values.x as string | undefined,
        y: values.y as string | undefined,
      },
      emit,
    ),
  text: commentText,
};
