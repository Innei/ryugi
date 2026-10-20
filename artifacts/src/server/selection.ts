import fs from 'node:fs';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { INSPECTOR_PROPERTIES, type InspectorProperty } from '../shared/inspector';
import { isArtifactId } from '../shared/ids';
import { DOCUMENT_SELECTION_LIMITS as DOC_LIMIT, SELECTION_FULL_NODES, SELECTION_LIMITS as LIMIT, SELECTION_MAX_NODES as MAX_NODES, type DocumentSelectionState, type SelectedNode, type SelectionChange, type SelectionNode, type SelectionState, type SelectionTweak } from '../shared/selection';
import { writeJsonAtomic } from './state';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const list = (value: unknown, max: number): value is unknown[] => Array.isArray(value) && value.length <= max;
const property = (value: unknown): value is InspectorProperty => INSPECTOR_PROPERTIES.some((item) => item === value);

function readNode(value: unknown): SelectionNode | null {
  if (!object(value) || !text(value.id, LIMIT.id) || !text(value.board, LIMIT.board) || !text(value.file, LIMIT.file) || !text(value.tag, LIMIT.tag) || !text(value.path, LIMIT.path) || !text(value.name, LIMIT.name)) return null;
  return { id: value.id, board: value.board, file: value.file, tag: value.tag, path: value.path, name: value.name };
}
function readChange(value: unknown): SelectionChange | null {
  if (!object(value) || !property(value.property) || !text(value.from, LIMIT.from) || !text(value.value, LIMIT.value)) return null;
  return { property: value.property, from: value.from, value: value.value };
}
function readAll<T>(values: unknown[], read: (value: unknown) => T | null): T[] | null {
  const out: T[] = [];
  for (const value of values) {
    const item = read(value);
    if (!item) return null;
    out.push(item);
  }
  return out;
}

export function readSelectionMessage(value: unknown): { id: string; tab: string; human: boolean; state: SelectionState } | null {
  if (!object(value) || value.type !== 'selection' || !text(value.artifact, 200) || !text(value.tab, 64) || !value.tab || typeof value.human !== 'boolean') return null;
  const id = value.artifact.startsWith('artboard/') ? value.artifact.slice('artboard/'.length) : '';
  if (!isArtifactId(id) || !Number.isSafeInteger(value.more) || (value.more as number) < 0) return null;
  if (!list(value.selected, SELECTION_FULL_NODES) || !list(value.tweaks, MAX_NODES) || !list(value.nodes, MAX_NODES)) return null;
  const selected = readAll<SelectedNode>(value.selected, (item) => {
    const node = readNode(item);
    if (!node || !object(item) || !text(item.text, LIMIT.text) || !text(item.html, LIMIT.html) || !list(item.tweaks, INSPECTOR_PROPERTIES.length)) return null;
    const tweaks = readAll(item.tweaks, readChange);
    return tweaks && { ...node, text: item.text, html: item.html, tweaks };
  });
  const tweaks = readAll<SelectionTweak>(value.tweaks, (item) => {
    const node = readNode(item);
    const change = readChange(item);
    return node && change && { ...node, ...change };
  });
  const nodes = readAll(value.nodes, readNode);
  if (!selected || !tweaks || !nodes) return null;
  return { id, tab: value.tab, human: value.human, state: { selected, more: value.more as number, tweaks, nodes } };
}

export function readDocumentSelectionMessage(value: unknown): { id: string; tab: string; human: boolean; state: DocumentSelectionState } | null {
  if (!object(value) || value.type !== 'selection' || !text(value.artifact, 200) || !text(value.tab, 64) || !value.tab || typeof value.human !== 'boolean') return null;
  const id = value.artifact.startsWith('document/') ? value.artifact.slice('document/'.length) : '';
  if (!isArtifactId(id) || typeof value.quote !== 'string' || typeof value.heading !== 'string') return null;
  if (!list(value.blockIds, DOC_LIMIT.blockIds) || !value.blockIds.every((block) => text(block, DOC_LIMIT.blockId))) return null;
  return {
    id,
    tab: value.tab,
    human: value.human,
    state: { quote: value.quote.slice(0, DOC_LIMIT.quote), blockIds: value.blockIds as string[], heading: value.heading.slice(0, DOC_LIMIT.heading) },
  };
}

type Kind = 'artboard' | 'document';

interface Tab { kind: Kind; id: string; state: SelectionState | DocumentSelectionState | null; humanAt: number; seenAt: number }

function readAnySelection(value: unknown) {
  const artifact = object(value) && typeof value.artifact === 'string' ? value.artifact : '';
  if (artifact.startsWith('document/')) {
    const message = readDocumentSelectionMessage(value);
    return message && { ...message, kind: 'document' as const, state: message.state.quote ? message.state : null };
  }
  const message = readSelectionMessage(value);
  return message && { ...message, kind: 'artboard' as const };
}

export function createSelectionStore(stateDir: string, exists: (kind: Kind, id: string) => boolean) {
  const tabs = new Map<Duplex, Tab>();
  let clock = 0;
  const fileOf = (kind: Kind, id: string) => path.join(stateDir, kind, id, 'selection.json');
  const write = (kind: Kind, id: string) => {
    let winner: Tab | undefined;
    for (const tab of tabs.values()) {
      if (tab.kind !== kind || tab.id !== id) continue;
      if (!winner || tab.humanAt > winner.humanAt || (tab.humanAt === winner.humanAt && tab.seenAt > winner.seenAt)) winner = tab;
    }
    if (!winner?.state) fs.rmSync(fileOf(kind, id), { force: true });
    else writeJsonAtomic(fileOf(kind, id), { artifact: `${kind}/${id}`, updatedAt: new Date().toISOString(), ...winner.state });
  };
  return {
    accept(socket: Duplex, value: unknown) {
      const message = readAnySelection(value);
      const previous = tabs.get(socket);
      if (!message || !exists(message.kind, message.id)) {
        if (previous) { tabs.delete(socket); write(previous.kind, previous.id); }
        return;
      }
      const same = previous?.kind === message.kind && previous.id === message.id;
      const humanAt = message.human ? ++clock : same ? previous.humanAt : 0;
      tabs.set(socket, { kind: message.kind, id: message.id, state: message.state, humanAt, seenAt: ++clock });
      if (previous && !same) write(previous.kind, previous.id);
      write(message.kind, message.id);
    },
    drop(socket: Duplex) {
      const tab = tabs.get(socket);
      if (!tab) return;
      tabs.delete(socket);
      write(tab.kind, tab.id);
    },
    clearAll() {
      tabs.clear();
      for (const kind of ['artboard', 'document'] as const) {
        let ids: string[] = [];
        try { ids = fs.readdirSync(path.join(stateDir, kind)); } catch { continue; }
        for (const id of ids) fs.rmSync(fileOf(kind, id), { force: true });
      }
    },
  };
}
