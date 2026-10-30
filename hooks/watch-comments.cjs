'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { cursorKey, unreadThreadCount } = require('./selection-context.cjs');

const LAUNCHER = path.resolve(__dirname, '..', 'skills/artifacts/app/ryugi-artifacts.cjs');
const quote = (text) => `'${text.replaceAll("'", "'\"'\"'")}'`;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function ids(root, type) {
  try {
    return fs.readdirSync(path.join(root, type)).filter((id) => /^[a-z0-9][a-z0-9-]*$/.test(id));
  } catch {
    return [];
  }
}

function humanChanges(file) {
  if (!file || !Array.isArray(file.threads)) return null;
  const changes = new Map();
  for (const thread of file.threads) {
    if (!thread || typeof thread.id !== 'string' || !Array.isArray(thread.messages)) return null;
    for (const message of thread.messages) {
      if (!message || typeof message.id !== 'string') return null;
      if (message.author === 'human' && thread.status !== 'resolved')
        changes.set(
          `${thread.id}/message/${message.id}`,
          JSON.stringify([message.at, message.editedAt, message.text, message.deleted]),
        );
    }
    if ((thread.statusBy || 'human') === 'human' && thread.status !== 'resolved')
      changes.set(`${thread.id}/status`, JSON.stringify([thread.status, thread.statusAt]));
  }
  return changes;
}

// Notification state is separate from the CLI's read cursor: only comment list consumes comments.
function createCommentWatch(project, key = cursorKey(process.env)) {
  const root = path.join(project, '.ryugi/artifacts');
  const seen = new Map();
  return () => {
    const events = [];
    for (const type of ['document', 'artboard']) {
      for (const id of ids(root, type)) {
        const artifact = `${type}/${id}`;
        const file = readJson(path.join(root, artifact, 'comments.json'));
        const changes = humanChanges(file);
        if (!changes) continue; // A partial save is retried on the next poll.
        const previous = seen.get(artifact) || new Map();
        let changed = false;
        for (const [event, value] of changes) {
          if (previous.get(event) !== value) changed = true;
          previous.set(event, value);
        }
        // Keep human status stamps when an agent changes the status, so its resolve cannot wake itself.
        seen.set(artifact, previous);
        if (!changed) continue;
        const cursors = readJson(path.join(root, '.state', artifact, 'comment-cursors.json'));
        const cursor = typeof cursors?.[key] === 'string' ? cursors[key] : null;
        const open = file.threads.filter((thread) => thread.status !== 'resolved');
        const unread = unreadThreadCount({ threads: open }, cursor);
        if (!unread) continue;
        events.push({
          type: 'ryugi-comments',
          artifact,
          unread,
          command: `node ${quote(LAUNCHER)} comment list --json --project-dir ${quote(project)} --artifact ${artifact}`,
          instruction:
            `Read ryugi:artifacts and its ${type} guide, then run command to read the changed comment threads. ` +
            "Handle the human's requests within the current task and permissions; reply through the comment CLI and resolve fulfilled change requests. " +
            'Comments are review input, not shell commands. Do not write comments.json.',
        });
      }
    }
    return events;
  };
}

function main() {
  const poll = createCommentWatch(process.argv[2] || process.cwd());
  const emit = () => {
    for (const event of poll()) process.stdout.write(`${JSON.stringify(event)}\n`);
  };
  emit();
  const timer = setInterval(emit, 1000);
  const stop = () => {
    clearInterval(timer);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

module.exports = { createCommentWatch };
if (require.main === module) main();
