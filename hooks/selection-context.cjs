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

function main() {
  const project = process.argv[2];
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch {}
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  const state = path.join(project, '.ryugi', 'artifacts', '.state');
  const files = selectionFiles(state).sort((a, b) => String(b.value.updatedAt).localeCompare(String(a.value.updatedAt)));
  const sections = [];
  let left = MAX_CONTEXT;
  for (const entry of files) {
    if (left <= 0) break;
    const section = describe(project, entry, prompt, left);
    if (!section) continue;
    sections.push(section);
    left -= section.length + 2;
  }
  if (!sections.length) return;
  process.stdout.write(`${sections.join('\n\n')}\n`);
}

main();
