import fs from 'node:fs';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { INSPECTOR_PROPERTIES, type InspectorProperty } from '../shared/inspector';
import { isArtifactId } from '../shared/ids';
import { SELECTION_FULL_NODES, SELECTION_LIMITS as LIMIT, SELECTION_MAX_NODES as MAX_NODES, type SelectedNode, type SelectionChange, type SelectionNode, type SelectionState, type SelectionTweak } from '../shared/selection';
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

interface Tab { id: string; state: SelectionState; humanAt: number; seenAt: number }

export function createSelectionStore(stateDir: string, exists: (id: string) => boolean) {
  const tabs = new Map<Duplex, Tab>();
  let clock = 0;
  const fileOf = (id: string) => path.join(stateDir, 'artboard', id, 'selection.json');
  const write = (id: string) => {
    let winner: Tab | undefined;
    for (const tab of tabs.values()) {
      if (tab.id !== id) continue;
      if (!winner || tab.humanAt > winner.humanAt || (tab.humanAt === winner.humanAt && tab.seenAt > winner.seenAt)) winner = tab;
    }
    if (!winner) fs.rmSync(fileOf(id), { force: true });
    else writeJsonAtomic(fileOf(id), { artifact: `artboard/${id}`, updatedAt: new Date().toISOString(), ...winner.state });
  };
  return {
    accept(socket: Duplex, value: unknown) {
      const message = readSelectionMessage(value);
      const previous = tabs.get(socket);
      if (!message || !exists(message.id)) {
        if (previous) { tabs.delete(socket); write(previous.id); }
        return;
      }
      const humanAt = message.human ? ++clock : previous?.id === message.id ? previous.humanAt : 0;
      tabs.set(socket, { id: message.id, state: message.state, humanAt, seenAt: ++clock });
      if (previous && previous.id !== message.id) write(previous.id);
      write(message.id);
    },
    drop(socket: Duplex) {
      const tab = tabs.get(socket);
      if (!tab) return;
      tabs.delete(socket);
      write(tab.id);
    },
    clearAll() {
      tabs.clear();
      let ids: string[] = [];
      try { ids = fs.readdirSync(path.join(stateDir, 'artboard')); } catch { return; }
      for (const id of ids) fs.rmSync(fileOf(id), { force: true });
    },
  };
}
