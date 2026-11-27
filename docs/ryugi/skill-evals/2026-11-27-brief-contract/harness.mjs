import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = process.env.BRIEF_EVAL_RUNS || '/tmp/brief-eval';
const CLI = {
  before: process.env.BRIEF_EVAL_BEFORE_CLI,
  after: process.env.BRIEF_EVAL_AFTER_CLI,
};
const daemonOf = (cli) => path.join(path.dirname(cli), 'ryugi-daemon');
const AT = (n) => '2026-11-20T08:' + String(n).padStart(2, '0') + ':00.000Z';
const MARKERS = ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_ENTRYPOINT', 'CODEX_THREAD_ID', 'CODEX_SESSION_ID', 'CODEX_SANDBOX', 'CODEX_CI', 'AI_AGENT'];

const human = (id, n, text, name = 'Reviewer') => ({ id, at: AT(n), author: 'human', name, text });
const agentSaid = (id, n, text) => ({ id, at: AT(n), author: 'agent', name: 'Agent', text });
const thread = (id, block, messages, extra = {}) => ({
  id,
  anchor: { blockId: block, quote: '' },
  status: 'open',
  statusAt: messages[0].at,
  statusBy: 'human',
  messages,
  ...extra,
});
const docXml = (title, blocks) =>
  '<doc>\n  <h1 id="title">' + title + '</h1>\n' + blocks.map(([id, tag, text]) => '  <' + tag + ' id="' + id + '">' + text + '</' + tag + '>').join('\n') + '\n</doc>\n';

const filler = (n) => Array.from({ length: n }, (_, i) => ['f' + (i + 1), 'p', 'Section ' + (i + 1) + ' describes how the relay queues events for offline devices and drains them in order.']);

export const TASKS = {
  'short-reply': {
    docs: { 'retry-policy': [docXml('Retry policy', [['b1', 'p', 'We retry failed deliveries up to five times.'], ['b2', 'p', 'Each retry waits twice as long as the last.']]), [thread('t1', 'b1', [human('m1', 1, 'Change five to three.')])]] },
    check: (p) => [has(p, 'retry-policy', 'b1', /three/i), lacks(p, 'retry-policy', 'b1', /five/i), replied(p, 'retry-policy', 't1')],
  },
  'long-thread': {
    docs: { limits: [docXml('API limits', [['h-limits', 'h2', 'Limits'], ['b1', 'p', 'Each key may send 100 requests per minute.']]), [thread('t1', 'h-limits', [human('m1', 1, 'Is this section about storage limits or request limits?'), agentSaid('a1', 2, 'Request limits only.'), human('m2', 3, 'Then the heading is too vague.'), agentSaid('a2', 4, 'Should I rename it?'), human('m3', 5, 'Yes. Rename the heading to "Rate limits". Leave the paragraph alone.')])]] },
    check: (p) => [has(p, 'limits', 'h-limits', /^Rate limits$/), has(p, 'limits', 'b1', /100 requests per minute/), replied(p, 'limits', 't1', 2)],
  },
  'multi-thread': {
    docs: { onboarding: [docXml('Onboarding', [['b1', 'p', 'New users see the tour on first launch.'], ['b2', 'p', 'The tour has seven steps.'], ['b3', 'p', 'Users can skip the tour from settings.']]), [thread('t1', 'b1', [human('m1', 1, 'Say "first sign-in" instead of "first launch".')]), thread('t2', 'b2', [human('m2', 2, 'It has five steps now.')]), thread('t3', 'b3', [human('m3', 3, 'They can skip it from the first step too; add that.')])]] },
    check: (p) => [has(p, 'onboarding', 'b1', /first sign-in/i), has(p, 'onboarding', 'b2', /five/i), has(p, 'onboarding', 'b3', /first step/i), replied(p, 'onboarding', 't1'), replied(p, 'onboarding', 't2'), replied(p, 'onboarding', 't3')],
  },
  pagination: {
    docs: { glossary: [docXml('Glossary', Array.from({ length: 12 }, (_, i) => ['g' + (i + 1), 'p', ['Relay', 'Hub', 'Artifact', 'Board', 'Round', 'Thread', 'Receipt', 'Snapshot', 'Cursor', 'Launcher', 'Daemon', 'Engine'][i] + ' is a term used in this product.'])), Array.from({ length: 12 }, (_, i) => thread('t' + (i + 1), 'g' + (i + 1), [human('m' + (i + 1), i + 1, 'Reply with the first word of this block, nothing else.')]))] },
    check: (p) => ['Relay', 'Hub', 'Artifact', 'Board', 'Round', 'Thread', 'Receipt', 'Snapshot', 'Cursor', 'Launcher', 'Daemon', 'Engine'].map((word, i) => replied(p, 'glossary', 't' + (i + 1), 1, new RegExp(word, 'i'))),
  },
  'resolve-only': {
    docs: { release: [docXml('Release notes', [['b1', 'p', 'This release adds offline sync.'], ['b2', 'p', 'It also fixes the export crash.']]), [thread('t1', 'b1', [human('m1', 1, 'Looks good, nothing to change here.')]), thread('t2', 'b2', [human('m2', 2, 'Fine as is.')])]] },
    check: (p) => [unchanged(p, 'release'), settled(p, 'release', 't1'), settled(p, 'release', 't2')],
  },
  'follow-up': {
    docs: { cache: [docXml('Cache', [['b1', 'p', 'Entries expire after 10 minutes.'], ['b2', 'p', 'The cache holds 500 entries.']]), [thread('t1', 'b1', [human('m1', 1, 'Make it 5 minutes.'), agentSaid('a1', 2, 'Changed to 5 minutes.'), human('m2', 3, 'Thanks. Also raise the capacity in the next paragraph to 1000 entries.')])]] },
    pre: (dir) => edit(dir, 'cache', 'b1', 'Entries expire after 5 minutes.'),
    check: (p) => [has(p, 'cache', 'b1', /5 minutes/), has(p, 'cache', 'b2', /1000/), replied(p, 'cache', 't1', 2)],
  },
  'concurrent-edit': {
    docs: { pricing: [docXml('Pricing', [['b1', 'p', 'The team plan costs 10 dollars per seat.'], ['b2', 'p', 'Annual billing saves two months.'], ['b3', 'p', 'Invoices are sent on the first day of the month.']]), [thread('t1', 'b1', [human('m1', 1, 'Change the team plan to 12 dollars per seat.')]), thread('t2', 'b2', [human('m2', 2, 'Say "saves 15%" instead of two months.')])]] },
    human: { after: 'comment', delay: 4000, artifact: 'pricing', block: 'b3', text: 'Invoices are sent on the last business day of the month.' },
    check: (p) => [has(p, 'pricing', 'b1', /12 dollars/), has(p, 'pricing', 'b2', /15%/), { name: 'human edit kept', ok: blockText(p, 'pricing', 'b3') === 'Invoices are sent on the last business day of the month.', humanKept: true }],
  },
  'find-block': {
    docs: { relay: [docXml('Relay design', [...filler(14), ['k1', 'p', 'Every event carries an idempotency key so a retried upload is stored once.'], ...filler(14).map(([id, t, x]) => [id.replace('f', 'z'), t, x])]), [thread('t1', 'title', [human('m1', 1, 'Which block explains why retried uploads are not stored twice? Reply with its block id.')])]] },
    check: (p) => [unchanged(p, 'relay'), replied(p, 'relay', 't1', 1, /\bk1\b/)],
  },
  'two-docs': {
    docs: {
      alpha: [docXml('Alpha', [['b1', 'p', 'Alpha ships in May.']]), [thread('t1', 'b1', [human('m1', 1, 'It ships in June now.')])]],
      beta: [docXml('Beta', [['b1', 'p', 'Beta needs two reviewers.']]), [thread('t1', 'b1', [human('m1', 2, 'One reviewer is enough.')])]],
    },
    check: (p) => [has(p, 'alpha', 'b1', /June/), has(p, 'beta', 'b1', /one reviewer/i), replied(p, 'alpha', 't1'), replied(p, 'beta', 't1')],
  },
  question: {
    docs: { retries: [docXml('Retries', [['b1', 'p', 'We retry five times because the carrier API drops about one request in a thousand under load.']]), [thread('t1', 'b1', [human('m1', 1, 'Why five and not three? Just explain, do not change the text.')])]] },
    check: (p) => [unchanged(p, 'retries'), replied(p, 'retries', 't1', 1, /thousand|carrier|drop/i)],
  },
};

const root = (p) => path.join(p, '.artideck', 'artifacts', 'document');
function edit(p, doc, block, text) {
  const file = path.join(root(p), doc, 'doc.xml');
  const xml = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, xml.replace(new RegExp('(<(\\w+) id="' + block + '"[^>]*>)[\\s\\S]*?(</\\2>)'), (_, open, _tag, close) => open + text + close));
}
function blockText(p, doc, block) {
  const xml = fs.readFileSync(path.join(root(p), doc, 'doc.xml'), 'utf8');
  const m = new RegExp('<(\\w+) id="' + block + '"[^>]*>([\\s\\S]*?)</\\1>').exec(xml);
  return m ? m[2].replace(/<[^>]+>/g, '').trim() : null;
}
const has = (p, doc, block, re) => ({ name: doc + '#' + block + ' ' + re, ok: re.test(blockText(p, doc, block) ?? '') });
const lacks = (p, doc, block, re) => ({ name: doc + '#' + block + ' lacks ' + re, ok: !re.test(blockText(p, doc, block) ?? '') });
function threadsOf(p, doc) {
  return JSON.parse(fs.readFileSync(path.join(root(p), doc, 'comments.json'), 'utf8')).threads ?? [];
}
function replied(p, doc, id, count = 1, re) {
  const t = threadsOf(p, doc).find((x) => x.id === id);
  const mine = (t?.messages ?? []).filter((m) => m.author === 'agent' && !['a1', 'a2'].includes(m.id));
  return { name: doc + '/' + id + ' replied' + (re ? ' ' + re : ''), ok: mine.length >= 1 && (!re || mine.some((m) => re.test(m.text))) };
}
function settled(p, doc, id) {
  const t = threadsOf(p, doc).find((x) => x.id === id);
  const mine = (t?.messages ?? []).filter((m) => m.author === 'agent');
  return { name: doc + '/' + id + ' answered or resolved', ok: t?.status === 'resolved' || mine.length > 0 };
}
function unchanged(p, doc) {
  const now = fs.readFileSync(path.join(root(p), doc, 'doc.xml'), 'utf8');
  const was = fs.readFileSync(path.join(p, '..', 'seed', doc + '.xml'), 'utf8');
  const text = (x) => x.replace(/\s+ryugi-attribution="[^"]*"|\s+artideck-attribution="[^"]*"/g, '').replace(/\s+/g, ' ').trim();
  return { name: doc + ' text unchanged', ok: text(now) === text(was) };
}

function wrapper(run, variant) {
  const cli = CLI[variant];
  if (!cli || !fs.existsSync(cli)) throw new Error('missing CLI for ' + variant + ': ' + cli);
  const script = '#!/bin/bash\n' +
    'RUN=' + JSON.stringify(run) + '\n' +
    'export RYUGI_SERVER_HOME="$RUN/home" XDG_CACHE_HOME="$RUN/cache" XDG_CONFIG_HOME="$RUN/config" RYUGI_NO_UPDATE_CHECK=1 ARTIFACTS_OPEN=0 RYUGI_ARTIFACTS_COMMAND="$RUN/adeck" RYUGI_DAEMON_SOCKET="$RUN/no-daemon.sock" RYUGI_ARTIFACTS_BOARD_PORTS=0 RYUGI_DAEMON_BIN=' + JSON.stringify(daemonOf(cli)) + '\n' +
    'out=$(mktemp "$RUN/out.XXXXXX")\n' +
    'node ' + JSON.stringify(cli) + ' "$@" > "$out" 2>&1\n' +
    'code=$?\n' +
    'cat "$out"\n' +
    'node ' + JSON.stringify(path.join(HERE, 'log.cjs')) + ' "$RUN" "$code" "$out" "$@"\n' +
    'rm -f "$out"\n' +
    'exit $code\n';
  fs.writeFileSync(path.join(run, 'adeck'), script, { mode: 0o555 });
}

function skillExcerpt(variant) {
  const file = path.join(HERE, 'skills', variant + '.md');
  return fs.readFileSync(file, 'utf8');
}

export function prepare(variant, task, rep, host) {
  const spec = TASKS[task];
  if (!spec) throw new Error('unknown task ' + task);
  const run = path.join(RUNS, [variant, host, task, rep].join('-'));
  fs.rmSync(run, { recursive: true, force: true });
  const project = path.join(run, 'project');
  for (const d of ['home', 'cache', 'config', 'seed']) fs.mkdirSync(path.join(run, d), { recursive: true });
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  for (const [doc, [xml, threads]] of Object.entries(spec.docs)) {
    const dir = path.join(root(project), doc);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'doc.xml'), xml);
    fs.writeFileSync(path.join(dir, 'comments.json'), JSON.stringify({ version: 1, threads }, null, 2));
  }
  spec.pre?.(project);
  for (const doc of Object.keys(spec.docs)) fs.copyFileSync(path.join(root(project), doc, 'doc.xml'), path.join(run, 'seed', doc + '.xml'));
  wrapper(run, variant);
  let started;
  for (let attempt = 0; attempt < 6; attempt++) {
    const port = 30000 + ((hash(run) + attempt * 7919) % 25000);
    started = spawnSync(path.join(run, 'adeck'), ['start', '--background', '--no-open', '--port', String(port), '--project-dir', project], { encoding: 'utf8', env: cleanEnv() });
    if (started.status === 0) break;
  }
  fs.writeFileSync(path.join(run, 'calls.jsonl'), '');
  if (started.status !== 0) throw new Error('hub did not start: ' + started.stdout + started.stderr);
  const docs = Object.keys(spec.docs).map((d) => 'document/' + d);
  const prompt = fs.readFileSync(path.join(HERE, 'prompt.md'), 'utf8')
    .replaceAll('{{ADECK}}', path.join(run, 'adeck'))
    .replaceAll('{{PROJECT}}', project)
    .replaceAll('{{ARTIFACTS}}', docs.join(' and '))
    .replaceAll('{{SKILL}}', skillExcerpt(variant))
    .replaceAll('{{ADECK}}', path.join(run, 'adeck'));
  fs.writeFileSync(path.join(run, 'prompt.md'), prompt);
  fs.writeFileSync(path.join(run, 'meta.json'), JSON.stringify({ variant, task, rep, host, project, docs, started: Date.now() }));
  if (spec.human) {
    const child = spawn(process.execPath, [path.join(HERE, 'human.mjs'), run, JSON.stringify(spec.human)], { detached: true, stdio: 'ignore' });
    child.unref();
  }
  return run;
}

function hash(text) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function cleanEnv() {
  const env = { ...process.env };
  for (const key of MARKERS) delete env[key];
  return env;
}

export function grade(run) {
  const meta = JSON.parse(fs.readFileSync(path.join(run, 'meta.json'), 'utf8'));
  const checks = TASKS[meta.task].check(meta.project);
  const calls = readCalls(run);
  const identity = calls.find((c) => c.args[0] !== 'start')?.env ?? {};
  const unread = meta.docs.map((artifact) => {
    const out = spawnSync(path.join(run, 'adeck'), ['comment', 'list', '--artifact', artifact, '--project-dir', meta.project, '--section', 'threads', '--format', 'json'], { encoding: 'utf8', env: { ...cleanEnv(), ...identity } });
    try {
      const wire = JSON.parse(out.stdout.trim().split('\n').pop());
      return { artifact, unread: wire.data.items.length };
    } catch {
      return { artifact, unread: null };
    }
  });
  fs.truncateSync(path.join(run, 'calls.jsonl'), Buffer.byteLength(calls.map((c) => JSON.stringify(c)).join('\n') + (calls.length ? '\n' : '')));
  const consumed = unread.every((u) => u.unread === 0);
  const humanKept = checks.find((c) => c.humanKept);
  const result = {
    ...meta,
    checks,
    unread,
    consumed,
    completed: checks.every((c) => c.ok) && consumed,
    tasksDone: checks.every((c) => c.ok),
    humanOverwritten: humanKept ? !humanKept.ok : null,
  };
  fs.writeFileSync(path.join(run, 'grade.json'), JSON.stringify(result, null, 2));
  spawnSync(path.join(run, 'adeck'), ['stop'], { encoding: 'utf8', env: cleanEnv() });
  return result;
}

export function readCalls(run) {
  const file = path.join(run, 'calls.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'prepare') console.log(prepare(...rest));
if (cmd === 'grade') console.log(JSON.stringify(grade(rest[0])));
