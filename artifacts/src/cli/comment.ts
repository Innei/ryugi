import fs from 'node:fs';

import { detectAgent } from '../server/agent';
import type { CommandSpec } from './command';
import { CliError, invocation } from './paths';
import { serverClient } from './server';
import type { Emit } from './start';

export const COMMENT_ACTIONS = ['list', 'add', 'reply', 'resolve', 'choose', 'submit'] as const;
export type CommentAction = (typeof COMMENT_ACTIONS)[number];

export interface CommentOptions {
  action: string | undefined;
  all?: boolean;
  artifact?: string;
  block?: string;
  board?: string;
  clear?: boolean;
  group?: string;
  projectDir: string;
  quote?: string;
  round?: string;
  text?: string;
  thread?: string;
  withdraw?: boolean;
  x?: string;
  y?: string;
}

const ARTIFACT = /^(?:document|artboard)\/[a-z0-9][a-z0-9-]*$/;
const WRITTEN = {
  add: 'comment-added',
  reply: 'comment-replied',
  resolve: 'comment-resolved',
} as const;
const RECORDED = { choose: 'choice-recorded', submit: 'round-submitted' } as const;

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
  if ((action === 'choose' || action === 'submit') && type !== 'artboard')
    throw new CliError(`comment ${action} works on artboards only`);
  if (action === 'choose') {
    if (!options.group) throw new CliError('comment choose needs --group <groupId>');
    if (!options.clear && !options.board)
      throw new CliError('comment choose needs --board <boardId>, or --clear');
    return { op: 'choose', group: options.group, board: options.clear ? null : options.board };
  }
  if (action === 'submit') {
    if (!options.round) throw new CliError('comment submit needs --round <roundId>');
    return { op: 'submit', round: options.round, submit: !options.withdraw };
  }
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
  if (!action)
    throw new CliError('comment needs an action: list, add, reply, resolve, choose or submit');
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
      ...(json.rounds ? { rounds: json.rounds } : {}),
      ...(options.all ? { all: true } : {}),
    });
  else if (action === 'choose')
    emit({
      type: RECORDED.choose,
      artifact: options.artifact,
      group: request.group,
      board: request.board,
      threadId: json.threadId,
    });
  else if (action === 'submit')
    emit({
      type: RECORDED.submit,
      artifact: options.artifact,
      round: request.round,
      submitted: request.submit,
      threadId: json.threadId,
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
  deleted?: boolean;
  name?: string;
  text: string;
}

interface ListedBoardAnchor {
  board?: string;
  nodes?: { board: string; path: string }[];
  offset?: { x: number; y: number };
  page: string;
  x: number;
  y: number;
}

interface ListedThread {
  anchor: { blockId: string; blockIds?: string[]; quote: string } | ListedBoardAnchor;
  changes?: string[];
  files?: Record<string, string>;
  id: string;
  messages: ListedMessage[];
  stale?: boolean;
  status: string;
  waitingOn: string | null;
}

interface ListedGroup {
  evidenceUpdated: boolean;
  id: string;
  kind?: 'verify';
  rejectThreads: number;
  title?: string;
  verdict: 'pending' | 'pass' | 'reject';
}

interface ListedChoice {
  byRecommendation: boolean;
  choice: string | null;
  id: string;
  kind: 'choose';
  threads: number;
}

interface ListedRound {
  id: string;
  state: 'open' | 'submitted' | 'closed';
  submitted?: string;
  title?: string;
}

function choiceText(group: ListedChoice) {
  const answer = group.choice
    ? `${group.choice}${group.byRecommendation ? ' by recommendation' : ''}`
    : 'no choice';
  const comments = group.threads ? ` (${plural(group.threads, 'comment')})` : '';
  return `  ${group.id} → ${answer}${comments}`;
}

function roundText(round: ListedRound) {
  const state =
    round.state === 'submitted' && round.submitted ? `submitted ${round.submitted}` : round.state;
  return `  ${round.id}${round.title ? ` (${round.title})` : ''}: ${state}`;
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
  if ('blockId' in anchor) {
    const ids = anchor.blockIds ?? [anchor.blockId];
    return [
      `  on ${ids.length > 1 ? 'blocks' : 'block'} ${ids.join(', ')}${anchor.quote ? ` "${clip(anchor.quote, 120)}"` : ''}`,
    ];
  }
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
      `  ${who}: ${message.deleted ? '[deleted]' : message.text.replaceAll('\n', '\n    ')}`,
    );
  }
  return lines.join('\n');
}

export function commentText(value: Record<string, unknown>): string | null {
  if (value.type === 'comments') {
    const threads = (value.threads as ListedThread[] | undefined) ?? [];
    const all = (value.groups as (ListedGroup | ListedChoice)[] | undefined) ?? [];
    const groups = all.filter((g): g is ListedGroup => g.kind !== 'choose');
    const choices = all.filter((g): g is ListedChoice => g.kind === 'choose');
    const rounds = (value.rounds as ListedRound[] | undefined) ?? [];
    const head = threads.length
      ? threads.map(threadText).join('\n\n')
      : value.all
        ? `No comments on ${value.artifact}.`
        : `No new comments on ${value.artifact}.`;
    return [
      head,
      groups.length ? `Verify groups:\n${groups.map(groupText).join('\n')}` : '',
      choices.length ? `Choice groups:\n${choices.map(choiceText).join('\n')}` : '',
      rounds.length ? `Rounds:\n${rounds.map(roundText).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  if (value.type === 'comment-added')
    return `Added thread ${value.threadId} (message ${value.messageId})`;
  if (value.type === 'comment-replied')
    return `Replied in thread ${value.threadId} (message ${value.messageId})`;
  if (value.type === 'comment-resolved') return `Resolved thread ${value.threadId}`;
  if (value.type === 'choice-recorded')
    return value.board
      ? `Recorded ${value.board} for ${value.group}`
      : `Cleared the choice in ${value.group}`;
  if (value.type === 'round-submitted')
    return `${value.submitted ? 'Submitted' : 'Withdrew'} round ${value.round}`;
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
    'choose  --artifact artboard/<id> --group <groupId> (--board <boardId> | --clear)',
    'submit  --artifact artboard/<id> --round <roundId> [--withdraw]',
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
    group: { type: 'string', value: '<groupId>', help: 'choose: the choice group' },
    clear: { type: 'boolean', help: 'choose: clear the choice instead of naming a board' },
    round: { type: 'string', value: '<roundId>', help: 'submit: the round' },
    withdraw: { type: 'boolean', help: 'submit: withdraw the submission' },
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
        group: values.group as string | undefined,
        clear: values.clear as boolean | undefined,
        round: values.round as string | undefined,
        withdraw: values.withdraw as boolean | undefined,
        x: values.x as string | undefined,
        y: values.y as string | undefined,
      },
      emit,
    ),
  text: commentText,
};
