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

export interface Thread<A = Anchor> {
  id: string;
  anchor: A;
  status: 'open' | 'resolved';
  statusAt: string;
  statusBy?: Author;
  messages: Message[];
}

export interface CommentsFile<A = Anchor> {
  version: 1;
  threads: Thread<A>[];
}

type Loose<T> = { [K in keyof T]?: T[K] };
export interface IncomingThread extends Loose<Omit<Thread<unknown>, 'messages'>> {
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

export type AgentOp =
  | { op: 'add'; blockId: string; quote: string; text: string }
  | { op: 'reply'; threadId: string; text: string }
  | { op: 'resolve'; threadId: string };

export type ThreadOp = Exclude<HumanOp, { op: 'create' }>;
export type AgentThreadOp = Exclude<AgentOp, { op: 'add' }>;

export interface AnchorSpec<A> {
  read(value: unknown): A | null;
  same(a: A, b: A): boolean;
  missing: string;
}

export const emptyComments = (): CommentsFile => ({ version: 1, threads: [] });

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const documentAnchors: AnchorSpec<Anchor> = {
  read: (value) =>
    isObject(value) && typeof value.blockId === 'string' && value.blockId
      ? { blockId: value.blockId, quote: typeof value.quote === 'string' ? value.quote : '' }
      : null,
  same: (a, b) => a.blockId === b.blockId && a.quote === b.quote,
  missing: 'a new thread needs anchor.blockId; dropped it',
};

export function parseComments(text: string): IncomingComments {
  const raw: unknown = JSON.parse(text);
  if (!isObject(raw)) throw new Error('comments.json must be an object');
  if (!Array.isArray(raw.threads)) throw new Error('threads must be an array');
  raw.threads.forEach((thread, i) => {
    if (!isObject(thread)) throw new Error(`threads[${i}] must be an object`);
    if (thread.messages !== undefined && !Array.isArray(thread.messages))
      throw new Error(`threads[${i}].messages must be an array`);
    if (!thread.id && !isObject(thread.anchor)) throw new Error(`threads[${i}] needs an anchor`);
  });
  return raw as unknown as IncomingComments;
}

const isSavedMessage = (m: Loose<Message>): m is Message =>
  !!m.id &&
  (m.author === 'human' || m.author === 'agent') &&
  typeof m.text === 'string' &&
  typeof m.at === 'string';

// The file the server last wrote is trusted as written; only entries the server has given ids count as saved.
export function savedComments(incoming: IncomingComments): CommentsFile;
export function savedComments<A>(incoming: IncomingComments, spec: AnchorSpec<A>): CommentsFile<A>;
export function savedComments<A>(
  incoming: IncomingComments,
  spec: AnchorSpec<A> = documentAnchors as unknown as AnchorSpec<A>,
): CommentsFile<A> {
  const threads: Thread<A>[] = [];
  for (const t of incoming.threads) {
    const anchor = spec.read(t.anchor);
    if (!t.id || !anchor || !t.statusAt || (t.status !== 'open' && t.status !== 'resolved'))
      continue;
    const messages = (t.messages ?? []).filter(isSavedMessage);
    const statusBy =
      t.statusBy === 'human' || t.statusBy === 'agent' ? { statusBy: t.statusBy } : {};
    threads.push({
      id: t.id,
      anchor,
      status: t.status,
      statusAt: t.statusAt,
      ...statusBy,
      messages,
    });
  }
  return { version: 1, threads };
}

const stampOf = (m: Pick<Message, 'at' | 'editedAt'>) => m.editedAt ?? m.at;

function mergeMessage(
  base: Message,
  incoming: Loose<Message>,
  origin: Author,
  now: string,
  warnings: string[],
): Message {
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
  return {
    ...base,
    text: incoming.text!,
    editedAt: incomingStamp === stampOf(base) ? now : incomingStamp,
  };
}

export interface Person {
  name?: string;
  avatar?: string;
}

const personOf = (who: Person | undefined): Person => ({
  ...(who?.name ? { name: who.name } : {}),
  ...(who?.avatar ? { avatar: who.avatar } : {}),
});

function mergeThread<A>(
  base: Thread<A>,
  incoming: IncomingThread,
  origin: Author,
  now: string,
  newId: () => string,
  warnings: string[],
  name: string | undefined,
): Thread<A> {
  const messages = [...base.messages];
  for (const message of incoming.messages ?? []) {
    const index = message.id ? messages.findIndex((m) => m.id === message.id) : -1;
    if (index >= 0) {
      messages[index] = mergeMessage(messages[index]!, message, origin, now, warnings);
      continue;
    }
    const author = message.author ?? origin;
    if (!message.id && messages.some((m) => m.author === author && m.text === message.text))
      continue;
    if (origin === 'agent' && author === 'human') {
      warnings.push(`thread ${base.id}: the agent cannot write human messages; dropped one`);
      continue;
    }
    if (typeof message.text !== 'string' || message.text.length === 0) continue;
    messages.push({
      id: message.id ?? newId(),
      author,
      ...personOf({ name }),
      text: message.text,
      at: message.at ?? now,
    });
  }
  messages.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  let { status, statusAt, statusBy } = base;
  if (incoming.status && incoming.status !== base.status) {
    const stamp =
      incoming.statusAt && incoming.statusAt !== base.statusAt ? incoming.statusAt : now;
    if (stamp >= base.statusAt) {
      status = incoming.status;
      statusAt = stamp;
      statusBy = origin;
    }
  }
  return { ...base, status, statusAt, ...(statusBy ? { statusBy } : {}), messages };
}

// The agent writes new threads and messages without ids; the server's rewrite adds them.
// A later write from the agent's id-less copy is the same entry, not a new one.
function sameUnsavedThread<A>(existing: Thread<A>, incoming: IncomingThread, spec: AnchorSpec<A>) {
  const anchor = spec.read(incoming.anchor);
  return (
    !!anchor &&
    spec.same(existing.anchor, anchor) &&
    existing.messages[0]?.text === incoming.messages?.[0]?.text
  );
}

export function mergeComments<A = Anchor>(
  base: CommentsFile<A>,
  incoming: IncomingComments,
  origin: Author,
  now: string,
  newId: () => string,
  name?: string,
  spec: AnchorSpec<A> = documentAnchors as unknown as AnchorSpec<A>,
): { file: CommentsFile<A>; warnings: string[] } {
  const warnings: string[] = [];
  const threads = [...base.threads];
  for (const thread of incoming.threads) {
    const index = thread.id
      ? threads.findIndex((t) => t.id === thread.id)
      : threads.findIndex((t) => sameUnsavedThread(t, thread, spec));
    if (index >= 0) {
      threads[index] = mergeThread(threads[index]!, thread, origin, now, newId, warnings, name);
      continue;
    }
    const anchor = spec.read(thread.anchor);
    if (!anchor) {
      warnings.push(spec.missing);
      continue;
    }
    const fresh: Thread<A> = {
      id: thread.id ?? newId(),
      anchor,
      status: 'open',
      statusAt: now,
      statusBy: origin,
      messages: [],
    };
    threads.push(
      mergeThread(
        fresh,
        { ...thread, status: thread.status ?? 'open' },
        origin,
        now,
        newId,
        warnings,
        name,
      ),
    );
  }
  return { file: { version: 1, threads }, warnings };
}

const updateThread = <A>(
  file: CommentsFile<A>,
  threadId: string,
  update: (thread: Thread<A>) => Thread<A>,
): CommentsFile<A> => ({
  ...file,
  threads: file.threads.map((thread) => (thread.id === threadId ? update(thread) : thread)),
});

const updateHumanMessage = <A>(
  thread: Thread<A>,
  messageId: string,
  update: (message: Message) => Message,
): Thread<A> => ({
  ...thread,
  messages: thread.messages.map((m) =>
    m.id === messageId && m.author === 'human' && !m.deleted ? update(m) : m,
  ),
});

export function openThread<A>(
  anchor: A,
  author: Author,
  text: string,
  now: string,
  newId: () => string,
  who?: Person,
): Thread<A> {
  return {
    id: newId(),
    anchor,
    status: 'open',
    statusAt: now,
    statusBy: author,
    messages: [{ id: newId(), author, ...personOf(who), text, at: now }],
  };
}

export function applyHumanOp(
  file: CommentsFile,
  op: HumanOp,
  now: string,
  newId: () => string,
  who?: Person,
): CommentsFile {
  if (op.op === 'create')
    return {
      ...file,
      threads: [
        ...file.threads,
        openThread({ blockId: op.blockId, quote: op.quote }, 'human', op.text, now, newId, who),
      ],
    };
  return applyThreadOp(file, op, now, newId, who);
}

export function applyThreadOp<A>(
  file: CommentsFile<A>,
  op: ThreadOp,
  now: string,
  newId: () => string,
  who?: Person,
): CommentsFile<A> {
  switch (op.op) {
    case 'reply':
      return updateThread(file, op.threadId, (t) => ({
        ...t,
        messages: [
          ...t.messages,
          { id: newId(), author: 'human', ...personOf(who), text: op.text, at: now },
        ],
      }));
    case 'edit':
      return updateThread(file, op.threadId, (t) =>
        updateHumanMessage(t, op.messageId, (m) => ({ ...m, text: op.text, editedAt: now })),
      );
    case 'delete':
      return updateThread(file, op.threadId, (t) =>
        updateHumanMessage(t, op.messageId, (m) => ({
          ...m,
          text: '',
          deleted: true,
          editedAt: now,
        })),
      );
    case 'resolve':
    case 'reopen':
      return updateThread(file, op.threadId, (t) => ({
        ...t,
        status: op.op === 'resolve' ? 'resolved' : 'open',
        statusAt: now,
        statusBy: 'human',
      }));
  }
}

export function waitingOn(thread: Thread<unknown>): Author | null {
  if (thread.status === 'resolved') return null;
  const last = thread.messages.filter((m) => !m.deleted).at(-1);
  if (!last) return null;
  return last.author === 'human' ? 'agent' : 'human';
}

export type ChangeKind =
  'new-thread' | 'new-message' | 'edited' | 'deleted' | 'resolved' | 'reopened';

export type UnreadThread<A = Anchor> = Thread<A> & {
  changes: ChangeKind[];
  messageIds: string[];
};

const humanStatus = (thread: Thread<unknown>) => (thread.statusBy ?? 'human') === 'human';

function humanStamps(thread: Thread<unknown>): string[] {
  const stamps = thread.messages.filter((m) => m.author === 'human').map(stampOf);
  return humanStatus(thread) ? [...stamps, thread.statusAt] : stamps;
}

function changesSince(
  thread: Thread<unknown>,
  cursor: string,
): Pick<UnreadThread, 'changes' | 'messageIds'> {
  const changes = new Set<ChangeKind>();
  const messageIds: string[] = [];
  thread.messages.forEach((m, index) => {
    if (m.author !== 'human') return;
    const created = m.at > cursor;
    if (m.deleted) {
      if (!created && stampOf(m) > cursor) changes.add('deleted');
      return;
    }
    if (created) {
      changes.add(index === 0 ? 'new-thread' : 'new-message');
      messageIds.push(m.id);
    } else if (stampOf(m) > cursor) {
      changes.add('edited');
      messageIds.push(m.id);
    }
  });
  if (
    !changes.has('new-thread') &&
    humanStatus(thread) &&
    thread.statusAt > cursor &&
    thread.messages.some((m) => m.at <= cursor)
  ) {
    changes.add(thread.status === 'resolved' ? 'resolved' : 'reopened');
  }
  return { changes: [...changes], messageIds };
}

function waitingSince(thread: Thread<unknown>): Pick<UnreadThread, 'changes' | 'messageIds'> {
  const live = thread.messages.filter((m) => !m.deleted);
  const afterAgent = live.map((m) => m.author).lastIndexOf('agent') + 1;
  return {
    changes: [live.length === 1 ? 'new-thread' : 'new-message'],
    messageIds: live.slice(afterAgent).map((m) => m.id),
  };
}

// With no cursor the agent has never listed: only threads it owes an answer count, so old documents don't all read as news.
export function unreadThreads<A>(
  file: CommentsFile<A>,
  cursor: string | null,
): { threads: UnreadThread<A>[]; newest: string | null } {
  const threads: UnreadThread<A>[] = [];
  let newest = cursor;
  for (const thread of file.threads) {
    for (const stamp of humanStamps(thread)) if (!newest || stamp > newest) newest = stamp;
    const unread =
      cursor === null
        ? waitingOn(thread) === 'agent'
          ? waitingSince(thread)
          : null
        : changesSince(thread, cursor);
    if (unread && unread.changes.length > 0) threads.push({ ...thread, ...unread });
  }
  return { threads, newest };
}

export function applyAgentOp(
  file: CommentsFile,
  op: AgentOp,
  now: string,
  newId: () => string,
  name?: string,
): { file: CommentsFile; threadId: string; messageId?: string } {
  if (op.op === 'add') {
    const thread = openThread(
      { blockId: op.blockId, quote: op.quote },
      'agent',
      op.text,
      now,
      newId,
      { name },
    );
    return {
      file: { ...file, threads: [...file.threads, thread] },
      threadId: thread.id,
      messageId: thread.messages[0]!.id,
    };
  }
  return applyAgentThreadOp(file, op, now, newId, name);
}

export function applyAgentThreadOp<A>(
  file: CommentsFile<A>,
  op: AgentThreadOp,
  now: string,
  newId: () => string,
  name?: string,
): { file: CommentsFile<A>; threadId: string; messageId?: string } {
  if (!file.threads.some((t) => t.id === op.threadId)) throw new Error(`no thread ${op.threadId}`);
  if (op.op === 'resolve') {
    return {
      file: updateThread(file, op.threadId, (t) => ({
        ...t,
        status: 'resolved',
        statusAt: now,
        statusBy: 'agent',
      })),
      threadId: op.threadId,
    };
  }
  const message: Message = {
    id: newId(),
    author: 'agent',
    ...personOf({ name }),
    text: op.text,
    at: now,
  };
  return {
    file: updateThread(file, op.threadId, (t) => ({ ...t, messages: [...t.messages, message] })),
    threadId: op.threadId,
    messageId: message.id,
  };
}
