'use strict';

const fs = require('fs');
const path = require('path');

const MAX_CONTEXT = 8000;
const MAX_HTML = 600;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function selectionFiles(state) {
  const files = [];
  let types = [];
  try { types = fs.readdirSync(state); } catch { return files; }
  for (const type of types) {
    let ids = [];
    try { ids = fs.readdirSync(path.join(state, type)); } catch { continue; }
    for (const id of ids) {
      const file = path.join(state, type, id, 'selection.json');
      const value = readJson(file);
      if (value && Array.isArray(value.selected) && Array.isArray(value.tweaks) && Array.isArray(value.nodes)) files.push({ file, value });
    }
  }
  return files;
}

const where = (node) => `${node.id} <${node.tag}> in ${node.file} at \`${node.path}\``;
const change = (item) => `${item.property}: ${item.from} → ${item.value}`;
const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function typedNodes(nodes, prompt) {
  const boards = [...new Set(nodes.map((node) => node.board))];
  const typed = new Set();
  for (const board of boards) {
    for (const match of prompt.matchAll(new RegExp(`(?<![A-Za-z0-9_-])${escape(board)}#(\\d+)(?!\\d)`, 'g'))) typed.add(`${board}#${match[1]}`);
  }
  return nodes.filter((node) => typed.has(node.id));
}

function describe(project, { file, value }, prompt, budget) {
  const named = typedNodes(value.nodes, prompt);
  if (!value.selected.length && !value.tweaks.length && !named.length) return '';
  const head = [`Artboard ${value.artifact}, open in the viewer (updated ${value.updatedAt}):`];
  if (named.length) {
    head.push('Nodes named in this message:');
    for (const node of named) head.push(`- ${where(node)}${node.name ? ` "${node.name}"` : ''}`);
  }
  const tail = `Full selection and node map: ${path.relative(project, file)}`;
  const body = [];
  if (value.selected.length) {
    const html = Math.max(80, Math.min(MAX_HTML, Math.floor(budget / 2 / value.selected.length)));
    body.push('Selected nodes:');
    for (const node of value.selected) {
      body.push(`- ${where(node)}${node.text ? ` "${clip(node.text, 120)}"` : ''}`);
      if (node.html) body.push(`  html: ${clip(node.html, html)}`);
      if (node.tweaks.length) body.push(`  preview tweaks: ${node.tweaks.map(change).join('; ')}`);
    }
    if (value.more) body.push(`(${value.more} more selected, listed in the file below)`);
  }
  if (value.tweaks.length) {
    body.push('Preview tweaks on other nodes (not in the source yet):');
    for (const tweak of value.tweaks) body.push(`- ${where(tweak)}: ${change(tweak)}`);
  }
  const fixed = head.join('\n').length + tail.length + 2;
  const room = Math.max(0, budget - fixed);
  const middle = body.join('\n');
  const kept = middle.length > room ? `${middle.slice(0, Math.max(0, room - 40))}\n(more in the file below)` : middle;
  return [head.join('\n'), kept, tail].filter(Boolean).join('\n');
}

const stampOf = (m) => m.editedAt || m.at;
const humanStatus = (thread) => (thread.statusBy || 'human') === 'human';

function waitingOnAgent(thread) {
  if (thread.status === 'resolved') return false;
  const live = (thread.messages || []).filter((m) => !m.deleted);
  return live.length > 0 && live[live.length - 1].author === 'human';
}

function changedSince(thread, cursor) {
  const messages = thread.messages || [];
  let changed = false;
  let newThread = false;
  messages.forEach((m, index) => {
    if (m.author !== 'human') return;
    const created = m.at > cursor;
    if (m.deleted) {
      if (!created && stampOf(m) > cursor) changed = true;
      return;
    }
    if (created || stampOf(m) > cursor) changed = true;
    if (created && index === 0) newThread = true;
  });
  if (!newThread && humanStatus(thread) && thread.statusAt > cursor && messages.some((m) => m.at <= cursor)) changed = true;
  return changed;
}

// Mirrors unreadThreads in artifacts/src/shared/comments.ts; artifacts/test/hook-parity.test.ts keeps them in step.
function unreadThreadCount(file, cursor) {
  const threads = file && Array.isArray(file.threads) ? file.threads : [];
  return threads.filter((thread) => (cursor === null ? waitingOnAgent(thread) : changedSince(thread, cursor))).length;
}

const cursorKey = (env) => (env.CLAUDE_CODE_IS_COWORK ? 'Claude Cowork' : 'Claude Code');

const LAUNCHER = path.resolve(__dirname, '..', 'skills', 'artifacts', 'app', 'ryugi-artifacts.cjs');

function documentIds(root) {
  try {
    return fs.readdirSync(path.join(root, 'document')).sort();
  } catch {
    return [];
  }
}

function commentReminders(project, root, key) {
  const lines = [];
  for (const id of documentIds(root)) {
    const file = readJson(path.join(root, 'document', id, 'comments.json'));
    if (!file) continue;
    const cursors = readJson(path.join(root, '.state', 'document', id, 'comment-cursors.json'));
    const cursor = cursors && typeof cursors[key] === 'string' ? cursors[key] : null;
    const count = unreadThreadCount(file, cursor);
    if (!count) continue;
    lines.push(`document/${id}: ${count} comment thread(s) changed since you last listed. Run \`node "${LAUNCHER}" comment list --json --project-dir "${project}" --artifact document/${id}\`.`);
  }
  return lines.join('\n');
}

function documentSelections(project, root, budget) {
  const sections = [];
  let left = budget;
  for (const id of documentIds(root)) {
    const file = path.join(root, '.state', 'document', id, 'selection.json');
    const value = readJson(file);
    if (!value || typeof value.quote !== 'string' || !value.quote || !Array.isArray(value.blockIds)) continue;
    const blocks = value.blockIds.length ? `${value.heading ? ',' : ' in'} blocks ${value.blockIds.join(', ')}` : '';
    const where = `${value.heading ? ` under "${value.heading}"` : ''}${blocks}`;
    const head = `Document document/${id}, open in the viewer (updated ${value.updatedAt}):\nSelected${where}:`;
    const tail = `Full selection: ${path.relative(project, file)}`;
    const room = left - head.length - tail.length - 4;
    if (room < 40) break;
    const quote = clip(value.quote, room).split('\n').map((line) => `> ${line}`).join('\n');
    const section = [head, quote, tail].join('\n');
    sections.push(section);
    left -= section.length + 2;
  }
  return sections;
}

function main() {
  const project = process.argv[2];
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch {}
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  const root = path.join(project, '.ryugi', 'artifacts');
  const state = path.join(root, '.state');
  const reminders = commentReminders(project, root, cursorKey(process.env));
  const files = selectionFiles(state).sort((a, b) => String(b.value.updatedAt).localeCompare(String(a.value.updatedAt)));
  const sections = [];
  let left = MAX_CONTEXT - (reminders ? reminders.length + 2 : 0);
  for (const entry of files) {
    if (left <= 0) break;
    const section = describe(project, entry, prompt, left);
    if (!section) continue;
    sections.push(section);
    left -= section.length + 2;
  }
  sections.push(...documentSelections(project, root, left));
  if (reminders) sections.push(reminders);
  if (!sections.length) return;
  process.stdout.write(`${sections.join('\n\n')}\n`);
}

module.exports = { unreadThreadCount, cursorKey };

if (require.main === module) main();
