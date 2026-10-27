import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyBoardAgentOp,
  applyBoardHumanOp,
  emptyBoardComments,
  mergeBoardComments,
  readBoardAnchor,
  savedBoardComments,
  type BoardAgentOp,
  type BoardAnchor,
  type BoardCommentsFile,
  type BoardHumanOp,
  type BoardThread,
} from '../shared/board-comments';
import { unreadThreads, waitingOn, type Person } from '../shared/comments';
import { groupVerdict } from '../shared/verdicts';
import type { ServerMessage } from '../shared/types';
import { createCommentCursors } from './comment-cursors';
import type { CommentNames } from './comment-names';
import { asHumanOp, createStore, isId, isText, type Store } from './document-comments';
import { resolveBoardFile } from './paths';

type BoardStore = Store<BoardCommentsFile, BoardHumanOp, BoardAgentOp>;

const boardRules = {
  empty: emptyBoardComments,
  saved: savedBoardComments,
  merge: mergeBoardComments,
  human: (
    file: BoardCommentsFile,
    op: BoardHumanOp,
    now: string,
    newId: () => string,
    who?: Person,
  ) => applyBoardHumanOp(file, op, now, newId, who),
  agent: applyBoardAgentOp,
};

const withoutHashes = ({ hashes: _hashes, ...anchor }: BoardAnchor): BoardAnchor => anchor;
const withoutVerdict = ({
  hashes: _hashes,
  group: _group,
  verdict: _verdict,
  ...anchor
}: BoardAnchor): BoardAnchor => anchor;

export function asBoardHumanOp(value: unknown): BoardHumanOp | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.op !== 'create') {
    const op = asHumanOp(value);
    return op && op.op !== 'create' ? op : null;
  }
  const anchor = readBoardAnchor(v.anchor);
  return anchor && isText(v.text) && v.text.length > 0
    ? { op: 'create', anchor: withoutHashes(anchor), text: v.text }
    : null;
}

export function asBoardAgentOp(value: unknown): BoardAgentOp | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.op === 'add') {
    const anchor = readBoardAnchor(v.anchor);
    return anchor && isText(v.text) && v.text.length > 0
      ? { op: 'add', anchor: withoutVerdict(anchor), text: v.text }
      : null;
  }
  if (v.op === 'reply')
    return isId(v.threadId) && isText(v.text) && v.text.length > 0
      ? { op: 'reply', threadId: v.threadId, text: v.text }
      : null;
  if (v.op === 'resolve') return isId(v.threadId) ? { op: 'resolve', threadId: v.threadId } : null;
  return null;
}

export interface BoardSpec {
  file: string;
  page: string;
  w: number;
}

export interface GroupSpec {
  title?: string;
  boards: string[];
  verify: boolean;
}

type RawCanvas = {
  boards?: Record<
    string,
    { type?: unknown; file?: unknown; src?: unknown; page?: unknown; w?: unknown }
  >;
  groups?: Record<string, { title?: unknown; boards?: unknown; verify?: unknown }>;
};

function readCanvasJson(dir: string): RawCanvas {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'canvas.json'), 'utf8')) as RawCanvas;
  } catch {
    return {};
  }
}

export function boardSpecs(dir: string): Record<string, BoardSpec> {
  return Object.fromEntries(
    Object.entries(readCanvasJson(dir).boards ?? {}).flatMap(([id, board]) => {
      const file = board?.type === 'image' || board?.type === 'video' ? board.src : board?.file;
      return typeof file === 'string'
        ? [
            [
              id,
              {
                file,
                page: typeof board.page === 'string' ? board.page : '',
                w: typeof board.w === 'number' ? board.w : 0,
              },
            ],
          ]
        : [];
    }),
  );
}

export function groupSpecs(dir: string): Record<string, GroupSpec> {
  return Object.fromEntries(
    Object.entries(readCanvasJson(dir).groups ?? {}).flatMap(([id, group]) =>
      Array.isArray(group?.boards)
        ? [
            [
              id,
              {
                ...(typeof group.title === 'string' ? { title: group.title } : {}),
                boards: group.boards.filter((b): b is string => typeof b === 'string'),
                verify: group.verify === true,
              },
            ],
          ]
        : [],
    ),
  );
}

export const boardFiles = (dir: string): Record<string, string> =>
  Object.fromEntries(Object.entries(boardSpecs(dir)).map(([id, spec]) => [id, spec.file]));

export function agentAddOnBoard(
  value: unknown,
  specs: Record<string, BoardSpec>,
): BoardAgentOp | { error: string } | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.op !== 'add' || typeof v.board !== 'string' || v.anchor !== undefined) return null;
  const spec = specs[v.board];
  if (!spec) return { error: `no board ${v.board}` };
  return asBoardAgentOp({
    op: 'add',
    anchor: { page: spec.page, board: v.board, x: v.x ?? spec.w, y: v.y ?? 0 },
    text: v.text,
  });
}

const hashCache = new Map<string, { stamp: string; hash: string }>();

function fileHash(dir: string, relative: string): string | null {
  const file = resolveBoardFile(dir, relative);
  if (!file) return null;
  try {
    const stat = fs.statSync(file);
    const stamp = `${stat.size}:${stat.mtimeMs}`;
    const cached = hashCache.get(file);
    if (cached?.stamp === stamp) return cached.hash;
    const hash = crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 12);
    hashCache.set(file, { stamp, hash });
    return hash;
  } catch {
    return null;
  }
}

export function boardHashes(dir: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(boardFiles(dir)).flatMap(([id, file]) => {
      const hash = fileHash(dir, file);
      return hash ? [[id, hash]] : [];
    }),
  );
}

const boardsOf = (anchor: BoardAnchor, groups: Record<string, GroupSpec> = {}) => [
  ...new Set([
    ...(anchor.board ? [anchor.board] : []),
    ...(anchor.nodes ?? []).map((node) => node.board),
    ...(anchor.group ? (groups[anchor.group]?.boards ?? []) : []),
  ]),
];

function stamp(
  anchor: BoardAnchor,
  hashes: Record<string, string>,
  groups: Record<string, GroupSpec> = {},
): BoardAnchor {
  const boards = boardsOf(anchor, groups);
  if (!boards.length) return withoutHashes(anchor);
  return {
    ...withoutHashes(anchor),
    hashes: Object.fromEntries(boards.map((board) => [board, hashes[board] ?? 'missing'])),
  };
}

const sameMembers = (thread: BoardThread, groups: Record<string, GroupSpec>) => {
  const group = thread.anchor.group;
  if (!group) return true;
  return (
    Object.keys(thread.anchor.hashes ?? {})
      .sort()
      .join('\n') === [...(groups[group]?.boards ?? [])].sort().join('\n')
  );
};

const isStale = (
  thread: BoardThread,
  hashes: Record<string, string>,
  groups: Record<string, GroupSpec>,
) =>
  !sameMembers(thread, groups) ||
  Object.entries(thread.anchor.hashes ?? {}).some(([board, hash]) => hashes[board] !== hash);

interface Options {
  root: string;
  stateDir: string;
  broadcast: (message: ServerMessage) => void;
  names?: CommentNames;
}

export type BoardCommentRegistry = ReturnType<typeof createBoardCommentRegistry>;

export function createBoardCommentRegistry(options: Options) {
  const stores = new Map<string, BoardStore>();
  const hashes = new Map<string, Record<string, string>>();
  const lastStale = new Map<string, string>();
  const cursors = createCommentCursors(options.stateDir, 'artboard');
  const dirOf = (id: string) => path.join(options.root, 'artboard', id);
  const store = (id: string) => {
    let found = stores.get(id);
    if (!found) {
      found = createStore(path.join(dirOf(id), 'comments.json'), boardRules, options.names);
      stores.set(id, found);
    }
    return found;
  };
  const currentHashes = (id: string) => {
    let found = hashes.get(id);
    if (!found) {
      found = boardHashes(dirOf(id));
      hashes.set(id, found);
    }
    return found;
  };
  const stale = (id: string) => {
    const now = currentHashes(id);
    const groups = groupSpecs(dirOf(id));
    return store(id)
      .current()
      .threads.filter((thread) => isStale(thread, now, groups))
      .map((thread) => thread.id);
  };
  const push = (id: string) => {
    const ids = stale(id);
    lastStale.set(id, JSON.stringify(ids));
    options.broadcast({
      type: 'board-comments',
      artifact: `artboard/${id}`,
      comments: store(id).current(),
      stale: ids,
    });
  };
  const fresh = (id: string) => {
    hashes.delete(id);
    return currentHashes(id);
  };
  const forAgent = (id: string, staleIds: Set<string>) => {
    const files = boardFiles(dirOf(id));
    const groups = groupSpecs(dirOf(id));
    return <T extends BoardThread>(thread: T) => ({
      ...thread,
      stale: staleIds.has(thread.id),
      waitingOn: waitingOn(thread),
      files: Object.fromEntries(
        boardsOf(thread.anchor, groups).flatMap((board) =>
          files[board] ? [[board, files[board]]] : [],
        ),
      ),
      messages: thread.messages.map(({ avatar: _avatar, ...message }) => message),
    });
  };

  return {
    comments: (id: string) => store(id).current(),
    stale,
    warnings: (id: string) => store(id).warnings(),
    apply: (id: string, op: BoardHumanOp) => {
      const groups = groupSpecs(dirOf(id));
      if (op.op === 'create' && op.anchor.verdict && !groups[op.anchor.group!]?.verify)
        throw new Error(`no verify group ${op.anchor.group} in artboard/${id}`);
      const stamped =
        op.op === 'create' ? { ...op, anchor: stamp(op.anchor, fresh(id), groups) } : op;
      store(id).apply(stamped);
      push(id);
      return { comments: store(id).current(), stale: stale(id) };
    },
    applyAgent: (id: string, op: BoardAgentOp, agent?: string) => {
      const stamped = op.op === 'add' ? { ...op, anchor: stamp(op.anchor, fresh(id)) } : op;
      const { threadId, messageId } = store(id).applyAgent(stamped, agent);
      push(id);
      return { threadId, ...(messageId ? { messageId } : {}) };
    },
    list: (id: string, agent: string, all: boolean) => {
      const changed = store(id).sync();
      if (changed) push(id);
      const file = store(id).current();
      const format = forAgent(id, new Set(stale(id)));
      if (all) return file.threads.filter((t) => !t.messages.every((m) => m.deleted)).map(format);
      const { threads, newest } = unreadThreads(file, cursors.get(id, agent));
      if (newest) cursors.set(id, agent, newest);
      return threads.map(format);
    },
    groups: (id: string) => {
      const specs = boardSpecs(dirOf(id));
      const threads = store(id).current().threads;
      const staleIds = new Set(stale(id));
      return Object.entries(groupSpecs(dirOf(id)))
        .filter(([, group]) => group.verify)
        .map(([groupId, group]) => {
          const { state, ...verdict } = groupVerdict(threads, groupId, staleIds);
          const page = group.boards.map((board) => specs[board]?.page).find(Boolean) ?? '';
          return {
            id: groupId,
            page,
            ...(group.title ? { title: group.title } : {}),
            verdict: state,
            ...verdict,
            boards: group.boards,
          };
        });
    },
    sync: (id: string) => {
      if (store(id).sync()) push(id);
    },
    boardsChanged: (id: string) => {
      fresh(id);
      if (!stores.has(id) && !fs.existsSync(path.join(dirOf(id), 'comments.json'))) return;
      if (JSON.stringify(stale(id)) !== (lastStale.get(id) ?? '[]')) push(id);
    },
  };
}
