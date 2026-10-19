import fs from 'node:fs';
import path from 'node:path';
import type { ServerMessage } from '../shared/types';
import type { CommentsFile, HumanOp } from '../shared/comments';
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
  warnings(id: string): string[];
  close(): Promise<void>;
}

interface RegistryOptions {
  root: string;
  stateDir: string;
  timing?: DocumentTiming;
  broadcast: (message: ServerMessage) => void;
  onWarningsChange: (id: string) => void;
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
  const commentStore = (id: string) => {
    let store = commentStores.get(id);
    if (!store) {
      store = createCommentStore(path.join(options.root, 'document', id, 'comments.json'));
      commentStores.set(id, store);
    }
    return store;
  };
  const pushComments = (id: string) =>
    options.broadcast({ type: 'doc-comments', artifact: `document/${id}`, comments: commentStore(id).current() });

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
        options.broadcast({ type: 'doc-status', artifact, streaming: event.streaming, outcome: event.outcome });
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
    commentsChanged: (id) => {
      const store = commentStore(id);
      const before = JSON.stringify(store.warnings());
      if (!store.sync()) return;
      pushComments(id);
      if (JSON.stringify(store.warnings()) !== before) options.onWarningsChange(id);
    },
    applyCommentOp: (id, op) => {
      const file = commentStore(id).apply(op);
      pushComments(id);
      return file;
    },
    warnings: (id) => [...(warnings.get(id) ?? []), ...commentStore(id).warnings()],
    close: async () => {
      const all = await Promise.all(sessions.values());
      await Promise.all(all.map((session) => session?.close()));
      sessions.clear();
    },
  };
}
