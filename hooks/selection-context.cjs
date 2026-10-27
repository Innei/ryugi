'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
  let types;
  try {
    types = fs.readdirSync(state);
  } catch {
    return files;
  }
  for (const type of types) {
    let ids;
    try {
      ids = fs.readdirSync(path.join(state, type));
    } catch {
      continue;
    }
    for (const id of ids) {
      const file = path.join(state, type, id, 'selection.json');
      const value = readJson(file);
      if (
        value &&
        Array.isArray(value.selected) &&
        Array.isArray(value.tweaks) &&
        Array.isArray(value.nodes)
      )
        files.push({ file, value });
    }
  }
  return files;
}

const where = (node) => `${node.id} <${node.tag}> in ${node.file} at \`${node.path}\``;
const change = (item) => `${item.property}: ${item.from} → ${item.value}`;
const clip = (text, max) => (text.length > max ? `${text.slice(0, max)}…` : text);

const escapeRegExp = (text) => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

function typedNodes(nodes, prompt) {
  const boards = [...new Set(nodes.map((node) => node.board))];
  const typed = new Set();
  for (const board of boards) {
    for (const match of prompt.matchAll(
      new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(board)}#(\\d+)(?!\\d)`, 'g'),
    ))
      typed.add(`${board}#${match[1]}`);
  }
  return nodes.filter((node) => typed.has(node.id));
}

function describe(session, { file, value }, prompt, budget) {
  const named = typedNodes(value.nodes, prompt);
  if (!value.selected.length && !value.tweaks.length && !named.length) return '';
  const head = [`Artboard ${value.artifact}, open in the viewer (updated ${value.updatedAt}):`];
  if (named.length) {
    head.push('Nodes named in this message:');
    for (const node of named) head.push(`- ${where(node)}${node.name ? ` "${node.name}"` : ''}`);
  }
  const tail = `Full selection and node map: ${path.relative(session, file)}`;
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
  const kept =
    middle.length > room
      ? `${middle.slice(0, Math.max(0, room - 40))}\n(more in the file below)`
      : middle;
  return [head.join('\n'), kept, tail].filter(Boolean).join('\n');
}

const stampOf = (m) => m.editedAt || m.at;
const humanStatus = (thread) => (thread.statusBy || 'human') === 'human';

function waitingOnAgent(thread) {
  if (thread.status === 'resolved') return false;
  const live = (thread.messages || []).filter((m) => !m.deleted);
  return live.length > 0 && live.at(-1).author === 'human';
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
  if (
    !newThread &&
    humanStatus(thread) &&
    thread.statusAt > cursor &&
    messages.some((m) => m.at <= cursor)
  )
    changed = true;
  return changed;
}

// Mirrors unreadThreads in artifacts/src/shared/comments.ts; artifacts/test/hook-parity.test.ts keeps them in step.
function unreadThreadCount(file, cursor) {
  const threads = file && Array.isArray(file.threads) ? file.threads : [];
  return threads.filter((thread) =>
    cursor === null ? waitingOnAgent(thread) : changedSince(thread, cursor),
  ).length;
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

const MAX_REMINDERS = 600;

function artifactIds(root, type) {
  try {
    return fs.readdirSync(path.join(root, type)).sort();
  } catch {
    return [];
  }
}

function commentReminders(project, root, key) {
  const waiting = [];
  for (const type of ['document', 'artboard']) {
    for (const id of artifactIds(root, type)) {
      const file = readJson(path.join(root, type, id, 'comments.json'));
      if (!file) continue;
      const cursors = readJson(path.join(root, '.state', type, id, 'comment-cursors.json'));
      const cursor = cursors && typeof cursors[key] === 'string' ? cursors[key] : null;
      const count = unreadThreadCount(file, cursor);
      if (count) waiting.push({ artifact: `${type}/${id}`, count });
    }
  }
  if (!waiting.length) return '';
  const types = new Set(waiting.map(({ artifact }) => artifact.split('/')[0]));
  const target =
    waiting.length === 1
      ? waiting[0].artifact
      : types.size === 1
        ? `${[...types][0]}/<id>`
        : '<type>/<id>';
  const command = `List them with \`node "${LAUNCHER}" comment list --json --project-dir "${project}" --artifact ${target}\`.`;
  const head = 'Comment threads changed since you last listed: ';
  const named = [];
  for (const [index, { artifact, count }] of waiting.entries()) {
    const more = waiting.length - index - 1;
    const next = [...named, `${artifact} (${count})`];
    const tail = more ? `, and ${more} more artifact(s)` : '';
    if (head.length + next.join(', ').length + tail.length + command.length + 2 > MAX_REMINDERS)
      break;
    named.push(next.at(-1));
  }
  const left = waiting.length - named.length;
  return `${head}${named.join(', ')}${left ? `${named.length ? ', and ' : ''}${left} more artifact(s)` : ''}.\n${command}`;
}

// Mirrors credentialsFile in artifacts/src/server/credentials.ts; artifacts/test/hook-auto-publish.test.ts keeps them in step.
function credentialsPath(env, platform, home) {
  if (platform === 'win32' && env.APPDATA)
    return path.join(env.APPDATA, 'ryugi', 'credentials.json');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'ryugi', 'credentials.json');
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

function remember(file, value) {
  try {
    fs.writeFileSync(file, `${value}\n`);
  } catch {}
}

function autoPublishContext(project, env, sessionId) {
  const state = path.join(project, '.ryugi', 'artifacts', '.state');
  const credentials = credentialsPath(env, process.platform, os.homedir());
  const signedIn = typeof (readJson(credentials) || {}).token === 'string';
  const settings = readJson(path.join(path.dirname(credentials), 'config.json')) || {};
  const lines = [];
  const askedFile = path.join(state, 'auto-publish-asked');
  if (signedIn && typeof settings.autoPublish !== 'boolean' && readText(askedFile) !== sessionId) {
    remember(askedFile, sessionId);
    lines.push(
      'Ryugi auto-publish is not decided yet. Ask your human partner once, in their language: when your turn ends, artifacts changed during it can be published automatically as private copies on Ryugi Cloud, so they can open them from another device (only they can see them; ryugi.innei.dev lists them when signed in). Nothing is published until they answer.',
      `Then run \`node "${LAUNCHER}" config --auto-publish on\` or \`node "${LAUNCHER}" config --auto-publish off\` with their answer.`,
    );
  }
  const notice = (readJson(path.join(state, 'auto-publish.json')) || {}).notice;
  const notifiedFile = path.join(state, 'auto-publish-notified');
  if (notice && typeof notice.id === 'string' && readText(notifiedFile) !== notice.id) {
    remember(notifiedFile, notice.id);
    if (notice.kind === 'signed-out') {
      lines.push(
        `Ryugi auto-publish paused: the Ryugi Cloud sign-in expired. Tell your human partner and offer to sign in again with \`node "${LAUNCHER}" publish --login --json --project-dir "${project}"\`.`,
      );
    } else if (notice.kind === 'failing') {
      lines.push(
        `Ryugi auto-publish could not publish ${clip(String(notice.message), 200)}. It keeps retrying. Tell your human partner, and fix the artifact's warnings if there are any.`,
      );
    } else if (notice.kind === 'cap' && typeof notice.upgradeUrl === 'string') {
      lines.push(
        `Ryugi Cloud refused a new cloud copy: ${clip(String(notice.message), 200)} Existing copies still update. Tell your human partner they can upgrade at ${clip(notice.upgradeUrl, 200)}.`,
      );
    } else if (notice.kind === 'cap') {
      lines.push(
        `Ryugi auto-publish could not create a new cloud copy (${clip(String(notice.message), 200)}). Existing copies still update. Tell your human partner; they can delete old copies with \`node "${LAUNCHER}" publish --list --json --project-dir "${project}"\` and \`--delete <cloud-id>\`.`,
      );
    }
  }
  return lines.join('\n');
}

function documentSelections(session, root, budget) {
  const sections = [];
  let left = budget;
  for (const id of documentIds(root)) {
    const file = path.join(root, '.state', 'document', id, 'selection.json');
    const value = readJson(file);
    if (!value || typeof value.quote !== 'string' || !value.quote || !Array.isArray(value.blockIds))
      continue;
    const blocks = value.blockIds.length
      ? `${value.heading ? ',' : ' in'} blocks ${value.blockIds.join(', ')}`
      : '';
    const where = `${value.heading ? ` under "${value.heading}"` : ''}${blocks}`;
    const head = `Document document/${id}, open in the viewer (updated ${value.updatedAt}):\nSelected${where}:`;
    const tail = `Full selection: ${path.relative(session, file)}`;
    const room = left - head.length - tail.length - 4;
    if (room < 40) break;
    const quote = clip(value.quote, room)
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    const section = [head, quote, tail].join('\n');
    sections.push(section);
    left -= section.length + 2;
  }
  return sections;
}

function main() {
  const project = process.argv[2];
  const session = process.argv[3] || project;
  let input = {};
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {}
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  const root = path.join(project, '.ryugi', 'artifacts');
  const state = path.join(root, '.state');
  const autoPublish = autoPublishContext(
    project,
    process.env,
    typeof input.session_id === 'string' ? input.session_id : '',
  );
  const reminders = [commentReminders(project, root, cursorKey(process.env)), autoPublish]
    .filter(Boolean)
    .join('\n\n');
  const files = selectionFiles(state).sort((a, b) =>
    String(b.value.updatedAt).localeCompare(String(a.value.updatedAt)),
  );
  const sections = [];
  // Reminders are capped at MAX_REMINDERS and reserved first so a large artboard selection cannot crowd them out.
  let left = MAX_CONTEXT - (reminders ? reminders.length + 2 : 0);
  for (const entry of files) {
    if (left <= 0) break;
    const section = describe(session, entry, prompt, left);
    if (!section) continue;
    sections.push(section);
    left -= section.length + 2;
  }
  sections.push(...documentSelections(session, root, left));
  if (reminders) sections.push(reminders);
  if (!sections.length) return;
  process.stdout.write(`${sections.join('\n\n')}\n`);
}

module.exports = {
  unreadThreadCount,
  cursorKey,
  credentialsPath,
  autoPublishContext,
  commentReminders,
};

if (require.main === module) main();
