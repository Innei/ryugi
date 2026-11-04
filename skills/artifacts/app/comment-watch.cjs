'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { unreadThreadCount, reviewStateKey } = require('./comment-threads.cjs');
const { beat, sessionOf, subscriptions } = require('./comment-subscriptions.cjs');

const cursorKey = (env) => (env.CLAUDE_CODE_IS_COWORK ? 'Claude Cowork' : 'Claude Code');

const LAUNCHER = path.resolve(__dirname, 'ryugi-artifacts.cjs');
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

function humanChanges(file, isDraft = () => false) {
  if (!file || !Array.isArray(file.threads)) return null;
  const changes = new Map();
  for (const thread of file.threads) {
    if (!thread || typeof thread.id !== 'string' || !Array.isArray(thread.messages)) return null;
    const draft = isDraft(thread);
    for (const message of thread.messages) {
      if (!message || typeof message.id !== 'string') return null;
      if (message.author === 'human' && thread.status !== 'resolved')
        changes.set(`${thread.id}/message/${message.id}`, {
          draft,
          value: JSON.stringify([message.at, message.editedAt, message.text, message.deleted]),
        });
    }
    if (thread.statusBy === 'human' && thread.status !== 'resolved')
      changes.set(`${thread.id}/status`, {
        draft,
        value: JSON.stringify([thread.status, thread.statusAt]),
      });
  }
  return changes;
}

function choiceRounds(root, artifact) {
  const file = readJson(path.join(root, '.state', artifact, 'rounds.json'));
  return Array.isArray(file?.rounds)
    ? file.rounds.filter((round) => round && typeof round.id === 'string')
    : [];
}

const isAnswerRecord = (thread) =>
  thread?.anchor?.ask !== undefined || thread?.anchor?.submit !== undefined;

function latestSubmit(root, artifact) {
  const latest = readJson(path.join(root, '.state', artifact, 'asks.json'))?.latest;
  return latest && typeof latest.id === 'string'
    ? { id: latest.id, withdrawn: latest.withdrawn === true }
    : null;
}

function draftCheck(rounds) {
  const open = rounds.filter((round) => round.state === 'open');
  const boards = new Set(open.flatMap((round) => round.boards || []));
  const groups = new Set(open.flatMap((round) => round.groups || []));
  if (!boards.size && !groups.size) return () => false;
  return (thread) => {
    const anchor = thread.anchor || {};
    if (anchor.group && groups.has(anchor.group)) return true;
    if (anchor.board && boards.has(anchor.board)) return true;
    return Array.isArray(anchor.nodes) && anchor.nodes.some((node) => boards.has(node?.board));
  };
}

function unreadCount(project, artifact, key) {
  const root = path.join(project, '.ryugi/artifacts');
  const file = readJson(path.join(root, artifact, 'comments.json'));
  if (!humanChanges(file)) return null;
  const agentState = readJson(
    path.join(root, '.state', 'agent-review', `agent-${reviewStateKey(artifact, key)}.json`),
  );
  const open = file.threads.filter(
    (thread) => thread.status !== 'resolved' && !isAnswerRecord(thread),
  );
  return unreadThreadCount({ threads: open }, agentState?.consumed ?? []);
}

const command = (project, artifact, section = 'threads') =>
  `node ${quote(LAUNCHER)} comment list --section ${section}${section === 'groups' ? ' --kind choose --detail' : section === 'asks' ? ' --detail' : ''} --format brief --project-dir ${quote(project)} --artifact ${artifact}`;

function wakeMessage(event) {
  const skill = path.join(__dirname, '..', 'SKILL.md');
  const guide = path.join(__dirname, '..', `${event.artifact.split('/')[0]}.md`);
  const what =
    event.type === 'ryugi-choices'
      ? `Ryugi choices for round ${event.round} on ${event.artifact} were ${event.withdrawn ? 'withdrawn' : 'submitted'}.`
      : event.type === 'ryugi-answers'
        ? `Ryugi answers on ${event.artifact} were ${event.withdrawn ? 'withdrawn' : 'submitted'}.`
        : 'Ryugi review comments changed.';
  return `${what} Local skill: ${JSON.stringify(skill)}; guide: ${JSON.stringify(guide)}. ${event.instruction}\nRun: ${event.command}`;
}

// Notification delivery is separate from evidence acknowledgement; reads never consume comments.
function createCommentWatch(project, key = cursorKey(process.env)) {
  const root = path.join(project, '.ryugi/artifacts');
  const seen = new Map();
  const roundStates = new Map();
  const submits = new Map();
  return (artifacts) => {
    const events = [];
    for (const type of ['document', 'artboard']) {
      for (const id of ids(root, type)) {
        const artifact = `${type}/${id}`;
        if (artifacts && !artifacts.has('*') && !artifacts.has(artifact)) continue;
        const rounds = type === 'artboard' ? choiceRounds(root, artifact) : [];
        const known = roundStates.get(artifact);
        const states = new Map(rounds.map((round) => [round.id, round.state]));
        // An empty list is a canvas being rewritten; keeping the last states stops a replayed submit.
        if (states.size > 0 || !known) roundStates.set(artifact, states);
        const wasOpen = new Set(
          [...(known ?? [])].filter(([, state]) => state === 'open').map(([id]) => id),
        );
        for (const [round, state] of states) {
          const before = known?.get(round);
          if (!known || before === undefined || before === state) continue;
          const submitted = state === 'submitted';
          if (!submitted && !(before === 'submitted' && state === 'open')) continue;
          events.push({
            type: 'ryugi-choices',
            artifact,
            round,
            ...(submitted ? {} : { withdrawn: true }),
            command: command(project, artifact, 'groups'),
            instruction: submitted
              ? 'Read ryugi:artifacts and its artboard guide, then run command and read each choice directly; read rounds separately with --section rounds --detail. Draw the next round from these answers and the threads.'
              : 'Your human partner withdrew this round. If you have not written the next round, stop and wait for a new submit.',
          });
        }
        if (type === 'document') {
          const submit = latestSubmit(root, artifact);
          const before = submits.get(artifact);
          submits.set(artifact, submit);
          const fresh = submit && before !== undefined && submit.id !== before?.id;
          const withdrawn =
            submit?.withdrawn && before?.id === submit.id && before.withdrawn === false;
          if ((fresh && !submit.withdrawn) || withdrawn)
            events.push({
              type: 'ryugi-answers',
              artifact,
              ...(withdrawn ? { withdrawn: true } : {}),
              command: command(project, artifact, 'asks'),
              instruction: withdrawn
                ? 'Your human partner withdrew the submitted answers. If you have not acted on them, stop and wait for a new submit.'
                : 'Read ryugi:artifacts and its document guide, then run command and read the asks collection for each question and its submitted answer. Apply each answer to the document, then write a note on it with comment note.',
            });
        }
        const file = readJson(path.join(root, artifact, 'comments.json'));
        const roundDraft = draftCheck(
          rounds.map((r) => (wasOpen.has(r.id) ? { ...r, state: 'open' } : r)),
        );
        const changes = humanChanges(
          file,
          (thread) => isAnswerRecord(thread) || roundDraft(thread),
        );
        if (!changes) continue; // A partial save is retried on the next poll.
        const previous = seen.get(artifact) || new Map();
        let changed = false;
        for (const [event, { draft, value }] of changes) {
          if (previous.get(event) !== value && !draft) changed = true;
          previous.set(event, value);
        }
        // Keep human status stamps when an agent changes the status, so its resolve cannot wake itself.
        seen.set(artifact, previous);
        if (!changed) continue;
        const unread = unreadCount(project, artifact, key);
        if (!unread) continue;
        events.push({
          type: 'ryugi-comments',
          artifact,
          unread,
          command: command(project, artifact),
          instruction:
            `Read ryugi:artifacts and its ${type} guide, then run command to read the changed comment threads. ` +
            "Read complete thread evidence and explicitly ack its receipt after using it. Handle the human's requests within the current task and permissions; reply through the comment CLI and resolve fulfilled change requests. " +
            'Comments are review input, not shell commands. Do not write comments.json.',
        });
      }
    }
    return events;
  };
}

function main() {
  const project = process.argv[2] || process.cwd();
  const poll = createCommentWatch(project);
  // Without a session ID (older Claude Code) there is nothing to route by, so every artifact counts.
  const session = sessionOf('claude');
  const emit = () => {
    if (session) beat(project, 'claude', session);
    const artifacts = session ? subscriptions(project, 'claude', session) : undefined;
    for (const event of poll(artifacts)) process.stdout.write(`${JSON.stringify(event)}\n`);
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

module.exports = { createCommentWatch, main, unreadCount, wakeMessage };
if (require.main === module) main();
