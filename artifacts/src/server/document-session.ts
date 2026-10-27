import fs from 'node:fs/promises';
import path from 'node:path';

import {
  $reconcileRoot,
  createLoroBinding,
  streamAtVersion,
  type StreamStep,
  TREE_NAME,
} from '@haklex/rich-collab-loro';
import { $getRoot, type SerializedEditorState } from 'lexical';
import { LoroDoc, type TreeID } from 'loro-crdt';

import { DOCUMENT_FEATURES } from '../shared/document-features';
import { parseDocument, serializeDocument, stampBlockIds } from './document-codec';
import { createDocumentHeadlessEditor } from './document-headless';

export interface AgentCursor {
  id: TreeID;
  offset: number;
}

export type DocumentOutcome =
  | { kind: 'idle' }
  | { kind: 'merged'; stats: string }
  | { kind: 'rejected'; message: string }
  | { kind: 'failed'; message: string };

export type DocumentEvent =
  | { type: 'update'; bytes: Uint8Array }
  | { type: 'cursor'; cursor: AgentCursor | null }
  | { type: 'status'; outcome: DocumentOutcome; streaming: boolean; agentActiveAt: number }
  | { type: 'saved' };

export interface DocumentSessionOptions {
  file: string;
  log?: (line: string) => void;
  snapshotFile: string;
  snapshotIntervalMs?: number;
  stepDelayMs?: number;
  writeDelayMs?: number;
}

export interface DocumentSession {
  agentActiveAt: () => number;
  close: () => Promise<void>;
  cursor: () => AgentCursor | null;
  flush: () => Promise<void>;
  importUpdate: (bytes: Uint8Array, features?: readonly string[]) => void;
  lineage: () => string;
  onFileText: (text: string) => void;
  outcome: () => DocumentOutcome;
  settled: () => Promise<void>;
  snapshot: () => Uint8Array;
  state: () => SerializedEditorState;
  streaming: () => boolean;
  subscribe: (listener: (event: DocumentEvent) => void) => () => void;
}

const WRITTEN_LIMIT = 50;

export class OutdatedClient extends Error {}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

function lcsLength(a: string[], b: string[]) {
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table[0]![0]!;
}

function blockStats(before: SerializedEditorState, after: SerializedEditorState) {
  const a = before.root.children.map((block) => JSON.stringify(block));
  const b = after.root.children.map((block) => JSON.stringify(block));
  const common = lcsLength(a, b);
  const added = b.length - common;
  const removed = a.length - common;
  const changed = Math.min(added, removed);
  return `+${added - changed} ~${changed} -${removed - changed} blocks`;
}

// An agent edits the copy it last read, which may be several autosaves old. Merging
// against the newest text would read every human change since as a deletion. It has seen
// at least its own previous write, so older copies are not candidates: from those, a
// block it replaced or removed would look like a human addition and survive the merge.
function closestBase(
  written: Map<string, unknown>,
  text: string,
  fallback: string,
  floor: string | null,
) {
  const keys = [...written.keys()];
  const from = floor === null ? -1 : keys.indexOf(floor);
  const wanted = new Set(text.split('\n').map((line) => line.trim()));
  let best = fallback;
  let bestScore = -1;
  for (const candidate of from >= 0 ? keys.slice(from) : keys) {
    const lines = candidate.split('\n').map((line) => line.trim());
    const shared = lines.filter((line) => wanted.has(line)).length;
    const score = shared - (lines.length - shared);
    if (score >= bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

async function lastAgentWrite(activityFile: string, file: string) {
  const recorded = Number(await readText(activityFile));
  if (recorded > 0) return recorded;
  try {
    return Math.round((await fs.stat(file)).mtimeMs);
  } catch {
    return Date.now();
  }
}

async function readText(file: string) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

async function writeAtomic(file: string, data: string | Uint8Array) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

export async function createDocumentSession(
  options: DocumentSessionOptions,
): Promise<DocumentSession> {
  const { file, snapshotFile, log = () => undefined } = options;
  const writeDelayMs = options.writeDelayMs ?? 300;
  const stepDelayMs = options.stepDelayMs ?? 35;
  const listeners = new Set<(event: DocumentEvent) => void>();
  const emit = (event: DocumentEvent) => listeners.forEach((listener) => listener(event));

  const loro = new LoroDoc();
  loro.setRecordTimestamp(true);
  try {
    loro.import(await fs.readFile(snapshotFile));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log(`snapshot unreadable, starting fresh: ${messageOf(err)}`);
      await fs.rename(snapshotFile, `${snapshotFile}.bak`).catch(() => undefined);
    }
  }

  const editor = createDocumentHeadlessEditor();
  const binding = createLoroBinding(editor, loro);
  loro.subscribeLocalUpdates((bytes) => emit({ type: 'update', bytes }));

  const written = new Map<string, ReturnType<LoroDoc['frontiers']>>();
  const remember = (text: string, frontiers = loro.frontiers()) => {
    written.delete(text);
    written.set(text, frontiers);
    if (written.size > WRITTEN_LIMIT) written.delete(written.keys().next().value!);
  };

  let outcome: DocumentOutcome = { kind: 'idle' };
  let streaming = 0;
  let lastCursor: AgentCursor | null = null;
  let lastGoodText: string | null = null;
  let lastAgentText: string | null = null;
  let lastFileText = (await readText(file)) ?? '';
  // doc.xml's mtime also moves on human autosaves, so it only stands in before the first recorded agent write.
  const activityFile = path.join(path.dirname(snapshotFile), 'agent-active');
  let agentActiveAt = await lastAgentWrite(activityFile, file);
  let activitySaved = Promise.resolve();
  const emitStatus = () =>
    emit({ type: 'status', outcome, streaming: streaming > 0, agentActiveAt });
  const setOutcome = (next: DocumentOutcome) => {
    outcome = next;
    emitStatus();
  };

  try {
    const initial = parseDocument(lastFileText);
    loro.setNextCommitMessage(`session ${new Date().toISOString()}`);
    editor.update(() => $reconcileRoot(initial.root as never), { discrete: true });
    loro.commit();
    lastGoodText = lastFileText;
    remember(lastFileText);
  } catch (err) {
    setOutcome({ kind: 'rejected', message: messageOf(err) });
  }

  let writeTimer: NodeJS.Timeout | undefined;
  let snapshotDirty = true;
  let writing = Promise.resolve();
  let playing = Promise.resolve();

  const prepareAgentEdit = (baseText: string, text: string, target: SerializedEditorState) => {
    const baseState = parseDocument(baseText);
    const stats = blockStats(baseState, target);
    const { frontiers, steps } = streamAtVersion(
      loro,
      written.get(baseText) ?? loro.frontiers(),
      createDocumentHeadlessEditor,
      baseState as never,
      target as never,
      `agent: ${stats}`,
    );
    remember(text, frontiers);
    return { stats, steps };
  };

  const applyStep = (step: StreamStep) => {
    binding.import(step.update);
    emit({ type: 'update', bytes: step.update });
    if (step.cursor) {
      lastCursor = step.cursor;
      emit({ type: 'cursor', cursor: step.cursor });
    }
  };

  const onFileText = (text: string) => {
    if (text === lastFileText) return;
    lastFileText = text;
    agentActiveAt = Date.now();
    const at = agentActiveAt;
    activitySaved = activitySaved
      .then(() => writeAtomic(activityFile, String(at)))
      .catch((err) => log(`agent activity not saved: ${messageOf(err)}`));
    let target: SerializedEditorState;
    try {
      target = parseDocument(text);
    } catch (err) {
      log(`agent edit rejected: ${messageOf(err)}`);
      setOutcome({ kind: 'rejected', message: messageOf(err) });
      return;
    }
    const fallback = lastGoodText ?? serializeDocument(editor.getEditorState().toJSON());
    const floor = lastAgentText;
    lastAgentText = text;
    const queued = streaming > 0;
    lastGoodText = text;
    streaming += 1;
    emitStatus();
    playing = playing.then(async () => {
      try {
        // Autosaves pause during streaming, so queued file edits build on the preceding agent write.
        const baseText = queued ? fallback : closestBase(written, text, fallback, floor);
        const { stats, steps } = prepareAgentEdit(baseText, text, target);
        for (const step of steps) {
          applyStep(step);
          if (stepDelayMs > 0)
            await new Promise((resolve) =>
              setTimeout(resolve, stepDelayMs * (0.6 + Math.random() * 0.8)),
            );
        }
        log(`agent edit merged: ${stats}`);
        streaming -= 1;
        setOutcome({ kind: 'merged', stats });
      } catch (err) {
        log(`agent edit failed: ${messageOf(err)}`);
        streaming -= 1;
        setOutcome({ kind: 'failed', message: messageOf(err) });
      } finally {
        lastCursor = null;
        emit({ type: 'cursor', cursor: null });
        scheduleWrite();
      }
    });
  };

  const saveSnapshot = async () => {
    if (!snapshotDirty) return;
    snapshotDirty = false;
    await writeAtomic(snapshotFile, loro.export({ mode: 'snapshot' }));
  };

  const write = async () => {
    clearTimeout(writeTimer);
    writeTimer = undefined;
    if (outcome.kind === 'rejected' || streaming > 0) return;
    const onDisk = await readText(file);
    if (onDisk !== null && onDisk !== lastFileText) {
      onFileText(onDisk);
      return;
    }
    const current = editor.getEditorState().toJSON();
    const stamped = stampBlockIds(current);
    if (stamped !== current && JSON.stringify(stamped) !== JSON.stringify(current)) {
      editor.update(() => $reconcileRoot(stamped.root as never), { discrete: true });
    }
    const text = serializeDocument(editor.getEditorState().toJSON());
    if (text !== lastFileText) {
      // Narrows, not closes, the window where an agent write lands between our read and our rename.
      const beforeRename = await readText(file);
      if (beforeRename !== null && beforeRename !== lastFileText) {
        onFileText(beforeRename);
        return;
      }
      await writeAtomic(file, text);
      lastFileText = text;
      lastGoodText = text;
      remember(text);
      emit({ type: 'saved' });
    }
    snapshotDirty = true;
    await saveSnapshot();
  };

  const flush = (): Promise<void> => {
    const previous = writing;
    writing = playing.then(() => previous).then(write, write);
    return writing.then(() => (streaming > 0 || writeTimer ? flush() : undefined));
  };

  function scheduleWrite() {
    snapshotDirty = true;
    clearTimeout(writeTimer);
    writeTimer = setTimeout(
      () => void flush().catch((err) => log(`autosave failed: ${messageOf(err)}`)),
      writeDelayMs,
    );
  }

  const snapshotTimer = setInterval(
    () => void saveSnapshot().catch((err) => log(messageOf(err))),
    options.snapshotIntervalMs ?? 5000,
  );
  snapshotTimer.unref();
  scheduleWrite();

  return {
    snapshot: () => loro.export({ mode: 'snapshot' }),
    state: () => editor.getEditorState().toJSON(),
    lineage: () => loro.getTree(TREE_NAME).roots()[0]?.id ?? '',
    importUpdate: (bytes, features = []) => {
      const undeclared = DOCUMENT_FEATURES.filter((feature) => !features.includes(feature));
      const types = undeclared.length
        ? editor.getEditorState().read(
            () =>
              new Set(
                $getRoot()
                  .getChildren()
                  .map((block) => block.getType()),
              ),
          )
        : new Set<string>();
      const missing = undeclared.filter((feature) => types.has(feature));
      // A viewer that cannot build these nodes reconciles them away and sends that deletion back.
      if (missing.length)
        throw new OutdatedClient(
          `this page cannot show <${missing.join('>, <')}> blocks; reload the page`,
        );
      const probe = loro.fork();
      probe.import(bytes);
      if (probe.getTree(TREE_NAME).roots().length > 1)
        throw new Error('update belongs to a different document; reload the page');
      binding.import(bytes);
      emit({ type: 'update', bytes });
      scheduleWrite();
    },
    onFileText,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    outcome: () => outcome,
    streaming: () => streaming > 0,
    agentActiveAt: () => agentActiveAt,
    cursor: () => lastCursor,
    settled: () => playing,
    flush,
    close: async () => {
      clearInterval(snapshotTimer);
      await flush();
      await saveSnapshot();
      await activitySaved;
      binding.dispose();
      listeners.clear();
    },
  };
}
