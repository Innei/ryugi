import {
  applyAgentThreadOp,
  applyThreadOp,
  isObject,
  mergeComments,
  openThread,
  savedComments,
  type AgentThreadOp,
  type AnchorSpec,
  type Author,
  type CommentsFile,
  type IncomingComments,
  type Person,
  type Thread,
  type ThreadOp,
} from './comments';

export interface BoardNodeRef {
  board: string;
  path: string;
}

export interface BoardAnchor {
  page: string;
  board?: string;
  x: number;
  y: number;
  nodes?: BoardNodeRef[];
  offset?: { x: number; y: number };
  hashes?: Record<string, string>;
}

export type BoardThread = Thread<BoardAnchor>;
export type BoardCommentsFile = CommentsFile<BoardAnchor>;
export type BoardHumanOp = { op: 'create'; anchor: BoardAnchor; text: string } | ThreadOp;
export type BoardAgentOp = { op: 'add'; anchor: BoardAnchor; text: string } | AgentThreadOp;

const MAX_ID = 100;
const MAX_PATH = 2000;
const MAX_NODES = 50;

const isName = (value: unknown, max = MAX_ID): value is string => typeof value === 'string' && value.length > 0 && value.length <= max;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isFraction = (value: unknown): value is number => isFiniteNumber(value) && value >= 0 && value <= 1;

function readNodes(value: unknown): BoardNodeRef[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_NODES) return null;
  const nodes: BoardNodeRef[] = [];
  for (const node of value) {
    if (!isObject(node) || !isName(node.board) || !isName(node.path, MAX_PATH)) return null;
    nodes.push({ board: node.board, path: node.path });
  }
  return nodes;
}

function readHashes(value: unknown): Record<string, string> | null {
  if (!isObject(value) || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_NODES || !entries.every(([board, hash]) => isName(board) && isName(hash))) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

export function readBoardAnchor(value: unknown): BoardAnchor | null {
  if (!isObject(value) || !isName(value.page) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;
  const anchor: BoardAnchor = { page: value.page, x: value.x, y: value.y };
  if (value.board !== undefined) {
    if (!isName(value.board)) return null;
    anchor.board = value.board;
  }
  if (value.nodes !== undefined) {
    const nodes = readNodes(value.nodes);
    if (!nodes) return null;
    anchor.nodes = nodes;
  }
  if (value.offset !== undefined) {
    const offset = value.offset;
    if (!anchor.nodes || !isObject(offset) || !isFraction(offset.x) || !isFraction(offset.y)) return null;
    anchor.offset = { x: offset.x, y: offset.y };
  }
  if (value.hashes !== undefined) {
    const hashes = readHashes(value.hashes);
    if (!hashes) return null;
    anchor.hashes = hashes;
  }
  return anchor;
}

export const boardAnchors: AnchorSpec<BoardAnchor> = {
  read: readBoardAnchor,
  same: (a, b) => a.page === b.page && a.board === b.board && a.x === b.x && a.y === b.y,
  missing: 'a new thread needs a board anchor (page, x, y); dropped it',
};

export const emptyBoardComments = (): BoardCommentsFile => ({ version: 1, threads: [] });

export const savedBoardComments = (incoming: IncomingComments): BoardCommentsFile => savedComments(incoming, boardAnchors);

export const mergeBoardComments = (base: BoardCommentsFile, incoming: IncomingComments, origin: Author, now: string, newId: () => string, name?: string) =>
  mergeComments(base, incoming, origin, now, newId, name, boardAnchors);

export function applyBoardHumanOp(file: BoardCommentsFile, op: BoardHumanOp, now: string, newId: () => string, who?: Person): BoardCommentsFile {
  if (op.op === 'create') return { ...file, threads: [...file.threads, openThread(op.anchor, 'human', op.text, now, newId, who)] };
  return applyThreadOp(file, op, now, newId, who);
}

export function applyBoardAgentOp(file: BoardCommentsFile, op: BoardAgentOp, now: string, newId: () => string, name?: string) {
  if (op.op === 'add') {
    const thread = openThread(op.anchor, 'agent', op.text, now, newId, { name });
    return { file: { ...file, threads: [...file.threads, thread] }, threadId: thread.id, messageId: thread.messages[0]!.id };
  }
  return applyAgentThreadOp(file, op, now, newId, name);
}
