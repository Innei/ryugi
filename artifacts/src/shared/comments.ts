export type Author = 'human' | 'agent';

export interface Message {
  id: string;
  author: Author;
  name?: string;
  avatar?: string;
  text: string;
  at: string;
  editedAt?: string;
  deleted?: true;
}

export interface Anchor {
  blockId: string;
  quote: string;
}

export interface Thread {
  id: string;
  anchor: Anchor;
  status: 'open' | 'resolved';
  statusAt: string;
  messages: Message[];
}

export interface CommentsFile {
  version: 1;
  threads: Thread[];
}

type Loose<T> = { [K in keyof T]?: T[K] };
export interface IncomingThread extends Loose<Omit<Thread, 'messages'>> {
  messages?: Loose<Message>[];
}
export interface IncomingComments {
  version?: number;
  threads: IncomingThread[];
}

export type HumanOp =
  | { op: 'create'; blockId: string; quote: string; text: string }
  | { op: 'reply'; threadId: string; text: string }
  | { op: 'edit'; threadId: string; messageId: string; text: string }
  | { op: 'delete'; threadId: string; messageId: string }
  | { op: 'resolve'; threadId: string }
  | { op: 'reopen'; threadId: string };

export const emptyComments = (): CommentsFile => ({ version: 1, threads: [] });

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function parseComments(text: string): IncomingComments {
  const raw: unknown = JSON.parse(text);
  if (!isObject(raw)) throw new Error('comments.json must be an object');
  if (!Array.isArray(raw.threads)) throw new Error('threads must be an array');
  raw.threads.forEach((thread, i) => {
    if (!isObject(thread)) throw new Error(`threads[${i}] must be an object`);
    if (thread.messages !== undefined && !Array.isArray(thread.messages)) throw new Error(`threads[${i}].messages must be an array`);
    if (!thread.id && !isObject(thread.anchor)) throw new Error(`threads[${i}] needs an anchor`);
  });
  return raw as unknown as IncomingComments;
}

const isSavedMessage = (m: Loose<Message>): m is Message =>
  !!m.id && (m.author === 'human' || m.author === 'agent') && typeof m.text === 'string' && typeof m.at === 'string';

// The file the server last wrote is trusted as written; only entries the server has given ids count as saved.
export function savedComments(incoming: IncomingComments): CommentsFile {
  const threads: Thread[] = [];
  for (const t of incoming.threads) {
    if (!t.id || !t.anchor?.blockId || !t.statusAt || (t.status !== 'open' && t.status !== 'resolved')) continue;
    const messages = (t.messages ?? []).filter(isSavedMessage);
    threads.push({ id: t.id, anchor: { blockId: t.anchor.blockId, quote: t.anchor.quote ?? '' }, status: t.status, statusAt: t.statusAt, messages });
  }
  return { version: 1, threads };
}

const stampOf = (m: Pick<Message, 'at' | 'editedAt'>) => m.editedAt ?? m.at;

function mergeMessage(base: Message, incoming: Loose<Message>, origin: Author, now: string, warnings: string[]): Message {
  if (base.deleted) return base;
  const incomingStamp = incoming.editedAt ?? incoming.at ?? base.at;
  if (incomingStamp < stampOf(base)) return base;
  const textChanged = incoming.text !== undefined && incoming.text !== base.text;
  const deleting = incoming.deleted === true;
  if (!textChanged && !deleting) return base;
  if (base.author === 'human' && origin === 'agent') {
    warnings.push(`message ${base.id}: the agent cannot change a human message; kept the original`);
    return base;
  }
  if (deleting) return { ...base, text: '', deleted: true, editedAt: now };
  return { ...base, text: incoming.text!, editedAt: incomingStamp === stampOf(base) ? now : incomingStamp };
}

export interface Person {
  name?: string;
  avatar?: string;
}

const personOf = (who: Person | undefined): Person => ({ ...(who?.name ? { name: who.name } : {}), ...(who?.avatar ? { avatar: who.avatar } : {}) });

function mergeThread(
  base: Thread,
  incoming: IncomingThread,
  origin: Author,
  now: string,
  newId: () => string,
  warnings: string[],
  name: string | undefined,
): Thread {
  const messages = [...base.messages];
  for (const message of incoming.messages ?? []) {
    const index = message.id ? messages.findIndex((m) => m.id === message.id) : -1;
    if (index >= 0) {
      messages[index] = mergeMessage(messages[index]!, message, origin, now, warnings);
      continue;
    }
    const author = message.author ?? origin;
    if (!message.id && messages.some((m) => m.author === author && m.text === message.text)) continue;
    if (origin === 'agent' && author === 'human') {
      warnings.push(`thread ${base.id}: the agent cannot write human messages; dropped one`);
      continue;
    }
    if (typeof message.text !== 'string' || message.text.length === 0) continue;
    messages.push({ id: message.id ?? newId(), author, ...personOf({ name }), text: message.text, at: message.at ?? now });
  }
  messages.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  let { status, statusAt } = base;
  if (incoming.status && incoming.status !== base.status) {
    const stamp = incoming.statusAt && incoming.statusAt !== base.statusAt ? incoming.statusAt : now;
    if (stamp >= base.statusAt) {
      status = incoming.status;
      statusAt = stamp;
    }
  }
  return { ...base, status, statusAt, messages };
}

// The agent writes new threads and messages without ids; the server's rewrite adds them.
// A later write from the agent's id-less copy is the same entry, not a new one.
const sameUnsavedThread = (existing: Thread, incoming: IncomingThread) =>
  existing.anchor.blockId === incoming.anchor?.blockId &&
  existing.anchor.quote === (incoming.anchor?.quote ?? '') &&
  existing.messages[0]?.text === incoming.messages?.[0]?.text;

export function mergeComments(
  base: CommentsFile,
  incoming: IncomingComments,
  origin: Author,
  now: string,
  newId: () => string,
  name?: string,
): { file: CommentsFile; warnings: string[] } {
  const warnings: string[] = [];
  const threads = [...base.threads];
  for (const thread of incoming.threads) {
    const index = thread.id ? threads.findIndex((t) => t.id === thread.id) : threads.findIndex((t) => sameUnsavedThread(t, thread));
    if (index >= 0) {
      threads[index] = mergeThread(threads[index]!, thread, origin, now, newId, warnings, name);
      continue;
    }
    if (!thread.anchor?.blockId) {
      warnings.push('a new thread needs anchor.blockId; dropped it');
      continue;
    }
    const fresh: Thread = {
      id: thread.id ?? newId(),
      anchor: { blockId: thread.anchor.blockId, quote: thread.anchor.quote ?? '' },
      status: 'open',
      statusAt: now,
      messages: [],
    };
    threads.push(mergeThread(fresh, { ...thread, status: thread.status ?? 'open' }, origin, now, newId, warnings, name));
  }
  return { file: { version: 1, threads }, warnings };
}

const updateThread = (file: CommentsFile, threadId: string, update: (thread: Thread) => Thread): CommentsFile => ({
  ...file,
  threads: file.threads.map((thread) => (thread.id === threadId ? update(thread) : thread)),
});

const updateHumanMessage = (thread: Thread, messageId: string, update: (message: Message) => Message): Thread => ({
  ...thread,
  messages: thread.messages.map((m) => (m.id === messageId && m.author === 'human' && !m.deleted ? update(m) : m)),
});

export function applyHumanOp(file: CommentsFile, op: HumanOp, now: string, newId: () => string, who?: Person): CommentsFile {
  switch (op.op) {
    case 'create':
      return {
        ...file,
        threads: [
          ...file.threads,
          {
            id: newId(),
            anchor: { blockId: op.blockId, quote: op.quote },
            status: 'open',
            statusAt: now,
            messages: [{ id: newId(), author: 'human', ...personOf(who), text: op.text, at: now }],
          },
        ],
      };
    case 'reply':
      return updateThread(file, op.threadId, (t) => ({ ...t, messages: [...t.messages, { id: newId(), author: 'human', ...personOf(who), text: op.text, at: now }] }));
    case 'edit':
      return updateThread(file, op.threadId, (t) => updateHumanMessage(t, op.messageId, (m) => ({ ...m, text: op.text, editedAt: now })));
    case 'delete':
      return updateThread(file, op.threadId, (t) => updateHumanMessage(t, op.messageId, (m) => ({ ...m, text: '', deleted: true, editedAt: now })));
    case 'resolve':
    case 'reopen':
      return updateThread(file, op.threadId, (t) => ({ ...t, status: op.op === 'resolve' ? 'resolved' : 'open', statusAt: now }));
  }
}

export function waitingOn(thread: Thread): Author | null {
  if (thread.status === 'resolved') return null;
  const last = thread.messages.filter((m) => !m.deleted).at(-1);
  if (!last) return null;
  return last.author === 'human' ? 'agent' : 'human';
}
