import fs from 'node:fs';
import path from 'node:path';
import type { ServerMessage } from '../shared/types';
import { unreadThreads, waitingOn, type AgentOp, type CommentsFile, type HumanOp, type Thread } from '../shared/comments';
import { createCommentCursors } from './comment-cursors';
import type { CommentNames } from './comment-names';
import { createCommentStore, type CommentStore } from './document-comments';
import { createDocumentSession, type DocumentOutcome, type DocumentSession } from './document-session';

export interface DocumentTiming {
  stepDelayMs?: number;
  writeDelayMs?: number;
}

export interface DocumentRegistry {
  open(id: string): Promise<DocumentSession | null>;
  fileChanged(id: string): void;
  comments(id: string): CommentsFile;
  commentsChanged(id: string): void;
  applyCommentOp(id: string, op: HumanOp): CommentsFile;
  applyAgentCommentOp(id: string, op: AgentOp, agent?: string): { threadId: string; messageId?: string };
  listComments(id: string, agent: string, all: boolean): AgentThread[];
  warnings(id: string): string[];
  close(): Promise<void>;
}

export type AgentThread = Thread & { waitingOn: ReturnType<typeof waitingOn>; changes?: string[]; messageIds?: string[] };

const forAgent = <T extends Thread>(thread: T) => ({
  ...thread,
  waitingOn: waitingOn(thread),
  messages: thread.messages.map(({ avatar: _avatar, ...message }) => message),
});

interface RegistryOptions {
  root: string;
  stateDir: string;
  timing?: DocumentTiming;
  broadcast: (message: ServerMessage) => void;
  onWarningsChange: (id: string) => void;
  names?: CommentNames;
  log?: (line: string) => void;
}

function outcomeWarnings(outcome: DocumentOutcome, streaming: boolean): string[] {
  if (streaming) return [];
  if (outcome.kind === 'rejected') return [`agent edit rejected: ${outcome.message} (doc.xml is left as written; fix it)`];
  if (outcome.kind === 'failed') return [`agent edit failed: ${outcome.message}`];
  return [];
}

export function createDocumentRegistry(options: RegistryOptions): DocumentRegistry {
  const sessions = new Map<string, Promise<DocumentSession | null>>();
  const warnings = new Map<string, string[]>();
  const docFile = (id: string) => path.join(options.root, 'document', id, 'doc.xml');
  const commentStores = new Map<string, CommentStore>();
  const cursors = createCommentCursors(options.stateDir);
  const commentStore = (id: string) => {
    let store = commentStores.get(id);
    if (!store) {
      store = createCommentStore(path.join(options.root, 'document', id, 'comments.json'), options.names);
      commentStores.set(id, store);
    }
    return store;
  };
  const pushComments = (id: string) =>
    options.broadcast({ type: 'doc-comments', artifact: `document/${id}`, comments: commentStore(id).current() });
  const syncComments = (id: string) => {
    const store = commentStore(id);
    const before = JSON.stringify(store.warnings());
    if (!store.sync()) return;
    pushComments(id);
    if (JSON.stringify(store.warnings()) !== before) options.onWarningsChange(id);
  };

  const create = async (id: string) => {
    if (!fs.existsSync(docFile(id))) return null;
    const session = await createDocumentSession({
      file: docFile(id),
      snapshotFile: path.join(options.stateDir, 'document', id, 'doc.loro'),
      ...options.timing,
      log: options.log,
    });
    const artifact = `document/${id}`;
    const setWarnings = (next: string[]) => {
      if (JSON.stringify(next) === JSON.stringify(warnings.get(id) ?? [])) return;
      warnings.set(id, next);
      options.onWarningsChange(id);
    };
    setWarnings(outcomeWarnings(session.outcome(), false));
    session.subscribe((event) => {
      if (event.type === 'update') {
        options.broadcast({ type: 'doc-update', artifact, bytes: Buffer.from(event.bytes).toString('base64') });
      } else if (event.type === 'cursor') {
        options.broadcast({ type: 'doc-cursor', artifact, cursor: event.cursor });
      } else {
        options.broadcast({ type: 'doc-status', artifact, streaming: event.streaming, outcome: event.outcome, agentActiveAt: event.agentActiveAt, now: Date.now() });
        setWarnings(outcomeWarnings(event.outcome, event.streaming));
      }
    });
    return session;
  };

  const open = (id: string) => {
    let session = sessions.get(id);
    if (!session) {
      session = create(id).catch((err) => {
        options.log?.(`document ${id} could not open: ${(err as Error).message}`);
        return null;
      });
      sessions.set(id, session);
      void session.then((s) => {
        if (!s) sessions.delete(id);
      });
    }
    return session;
  };

  return {
    open,
    fileChanged: (id) => {
      const known = sessions.has(id);
      void open(id).then((session) => {
        if (!session || !known) return;
        fs.readFile(docFile(id), 'utf8', (err, text) => {
          if (!err) session.onFileText(text);
        });
      });
    },
    comments: (id) => commentStore(id).current(),
    commentsChanged: syncComments,
    applyCommentOp: (id, op) => {
      const file = commentStore(id).apply(op);
      pushComments(id);
      return file;
    },
    applyAgentCommentOp: (id, op, agent) => {
      const { threadId, messageId } = commentStore(id).applyAgent(op, agent);
      pushComments(id);
      return { threadId, ...(messageId ? { messageId } : {}) };
    },
    listComments: (id, agent, all) => {
      syncComments(id);
      const file = commentStore(id).current();
      if (all) return file.threads.filter((t) => !t.messages.every((m) => m.deleted)).map(forAgent);
      const { threads, newest } = unreadThreads(file, cursors.get(id, agent));
      if (newest) cursors.set(id, agent, newest);
      return threads.map(forAgent);
    },
    warnings: (id) => [...(warnings.get(id) ?? []), ...commentStore(id).warnings()],
    close: async () => {
      const all = await Promise.all(sessions.values());
      await Promise.all(all.map((session) => session?.close()));
      sessions.clear();
    },
  };
}
