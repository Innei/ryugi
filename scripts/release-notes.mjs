#!/usr/bin/env node
// Generates a Ryugi plugin release note from conventional commits.
//
//   node scripts/release-notes.mjs --tag v1.98.0
//   node scripts/release-notes.mjs --tag v1.98.0 --cloud ../ryugi-cloud --ai
//   node scripts/release-notes.mjs --tag detect-agent-v0.1.0 --previous v1.46.0 --scope detect-agent
//
// Without --ai it renders the note deterministically from commit subjects.
// --cloud adds the private ryugi-cloud commits between artifacts-v<previous>
// and artifacts-v<version> that touch what ships; they never get a link, and
// only their subject and body reach the model.
// With --ai it asks an OpenAI-compatible chat completions endpoint to rewrite
// the same commits as user-facing notes, validating every link; if the call or
// the validation fails it falls back to the deterministic note (or exits 1
// with --ai-strict). Markdown goes to stdout.
//
// AI configuration:
//   RELEASE_NOTES_API_URL  default https://api.deepseek.com/chat/completions
//   RELEASE_NOTES_API_KEY  required for --ai
//   RELEASE_NOTES_MODEL    default deepseek-flash

import { execFileSync } from 'node:child_process';

import { CLOUD_HIDDEN_SCOPES, CLOUD_SHIPPED_PATHS, privateArea } from './release-notes-cloud.mjs';

const REPO = 'Innei/ryugi';
const URL = `https://github.com/${REPO}`;
const AREA_ORDER = [
  'Hub & CLI',
  'Viewer',
  'Cloud links',
  'Daemon',
  'Skills',
  'Hosts',
  'Detect agent',
  'Docs',
  'Brand',
  'Other',
];
const LABEL_ORDER = ['New', 'Fix', 'Improved'];
const AI_URL = process.env.RELEASE_NOTES_API_URL || 'https://api.deepseek.com/chat/completions';
const AI_KEY = process.env.RELEASE_NOTES_API_KEY;
const AI_MODEL = process.env.RELEASE_NOTES_MODEL || 'deepseek-flash';

const SCOPE_AREA = {
  'artifacts': 'Hub & CLI',
  'hub': 'Hub & CLI',
  'cli': 'Hub & CLI',
  'server': 'Hub & CLI',
  'preview': 'Hub & CLI',
  'plugin': 'Hub & CLI',
  'viewer': 'Viewer',
  'runtime': 'Viewer',
  'document': 'Viewer',
  'artboard': 'Viewer',
  'whiteboard': 'Viewer',
  'slides': 'Viewer',
  'storyboard': 'Viewer',
  'verify': 'Viewer',
  'report': 'Viewer',
  'mockup': 'Viewer',
  'html': 'Viewer',
  'library': 'Viewer',
  'shared': 'Viewer',
  'cloud': 'Cloud links',
  'publish': 'Cloud links',
  'share': 'Cloud links',
  'relay': 'Cloud links',
  'daemon': 'Daemon',
  'skills': 'Skills',
  'brainstorming': 'Skills',
  'executing-specs': 'Skills',
  'using-git-worktrees': 'Skills',
  'using-ryugi': 'Skills',
  'verifying-ui': 'Skills',
  'interface-craft': 'Skills',
  'skill-evals': 'Skills',
  'evals': 'Skills',
  'spec': 'Skills',
  'specs': 'Skills',
  'hooks': 'Hosts',
  'codex': 'Hosts',
  'antigravity': 'Hosts',
  'pi': 'Hosts',
  'hermes': 'Hosts',
  'muse': 'Hosts',
  'kimi': 'Hosts',
  'cursor': 'Hosts',
  'opencode': 'Hosts',
  'readme': 'Docs',
  'docs': 'Docs',
  'contributing': 'Docs',
  'upstream': 'Docs',
  'brand': 'Brand',
  'detect-agent': 'Detect agent',
};

// Release tooling and CI changes stay out of the deterministic note;
// dependencies and internal refactors only reach a release as maintenance.
const HIDDEN_SCOPES = new Set(['release', 'ci']);
const TYPE_LABEL = { feat: 'New', fix: 'Fix', perf: 'Improved', style: 'Improved' };

// The one historical commit whose subject git truncated. Its diff adds the
// storyboard type and makes comment watchers wake an agent on a storyboard.
const SUBJECT_OVERRIDES = {
  '42084c1f1382cb8e5b28ef8c6281d6f622a89786':
    'the storyboard type: a row in the type table for product demo videos, and comments on storyboards wake the agent',
};

const AI_SYSTEM_PROMPT = `You write release notes for Ryugi, a plugin that gives coding agents interactive artifacts (artboards, documents, whiteboards, slides, storyboards) they publish and collect comments on.

Audience: developers who use Ryugi inside a coding agent. They want to know what changed in how they work, not which files changed.

Each commit is either public (it has a sha, stat and diff) or private (marked "private": true, with only its subject and body). Private commits come from a closed repository: describe them from their subject and body only, never invent a link or an identifier for them.

Sections:
- Hub & CLI: the local hub, the ryugi command, publishing from the agent, previews.
- Viewer: artifact types and what they look like or let you do (documents, artboards, whiteboards, slides, storyboards, verify reports).
- Cloud links: published share links, Cloud pages and live sync.
- Daemon: the resident daemon that starts and steers agent sessions from the phone.
- Skills, Hosts, Detect agent, Docs, Brand, Other: as their names say.

Rules:
- Open with a lead paragraph of one or two sentences when the release contains a feature (feat) or more than one user-facing change. Skip it for a single fix, a version bump, or a maintenance release.
- Then area sections in this order, omitting empty ones: ## Hub & CLI, ## Viewer, ## Cloud links, ## Daemon, ## Skills, ## Hosts, ## Detect agent, ## Docs, ## Brand, ## Other.
- Each bullet is "**Short title** — one sentence, two at most, on the user-visible change." Keep the bold title under six words. Write for someone deciding whether to upgrade, not for someone reviewing the diff.
- No file paths, command flags, option names, internal identifiers, line counts, or file lists. Mention a command only when the user must type it.
- Merge commits that describe one change into one bullet. Each change appears once; do not repeat the same work in two sections.
- Skip README, package metadata, specs, tests, CI, refactors, and routine dependency bumps. When every commit is documentation, write a single ## Docs bullet instead of a maintenance line.
- End every bullet that covers public commits with their links: ([abc1234](https://github.com/Innei/ryugi/commit/FULL_SHA)). For several commits, separate the links with ", ". A bullet that covers only private commits ends without a link.
- If there are no commits, or nothing user-facing remains, output exactly one line: "Version bump only." or "Maintenance release: dependency and tooling updates."
- No Full Changelog line; it is appended later. Output only Markdown, no code fence. English, no emojis, no marketing adjectives.

Shape, not content:
## Viewer

- **Design docs as the spec** — An approved design document now serves as the spec; the spec file only points to it, and approval is a question on the doc itself. ([8ace8fe](https://github.com/Innei/ryugi/commit/8ace8fe69234632a2e1e3619fefe82f707261819))`;

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const gitIn = (dir, ...args) =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const git = (...args) => gitIn(root, ...args);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    const name = key.slice(2);
    if (name === 'help') return { help: true };
    if (name === 'ai' || name === 'ai-strict') {
      out[name] = true;
      continue;
    }
    out[name] = argv[++i];
  }
  return out;
}

function fail(message) {
  console.error(`release-notes: ${message}`);
  process.exit(1);
}

function semver(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return m ? m.slice(1).map(Number) : null;
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function versionTags() {
  return git('tag', '--list', 'v*')
    .split('\n')
    .filter(Boolean)
    .map((t) => [t, semver(t)])
    .filter(([, v]) => v)
    .sort((a, b) => compareSemver(a[1], b[1]))
    .map(([t]) => t);
}

function previousTag(tag, explicit, tags) {
  if (explicit) return explicit;
  const target = semver(tag);
  if (!target) return null;
  const earlier = tags.filter((t) => compareSemver(semver(t), target) < 0);
  return earlier.at(-1) ?? null;
}

function isReleaseCommit(subject) {
  return /^chore(?:\((?:release|artifacts)\))?: (?:release|v?\d)/.test(subject);
}

function parseSubject(raw) {
  const stripped = raw.replace(/^[^\p{L}\p{N}(]+/u, '');
  const colon = stripped.indexOf(':');
  if (colon === -1) return null;
  const m = /^(feat|fix|perf|style|refactor|docs|chore|test|build|ci)(?:\(([^)]*)\))?!?$/.exec(
    stripped.slice(0, colon),
  );
  if (!m) return null;
  return { type: m[1], scope: m[2] || '', subject: stripped.slice(colon + 1).trim() };
}

function areaFor(parsed) {
  if (parsed.type === 'docs') return 'Docs';
  if (HIDDEN_SCOPES.has(parsed.scope)) return null;
  return SCOPE_AREA[parsed.scope] ?? 'Other';
}

function tidySubject(subject) {
  let s = subject.trim().replaceAll(/\s+/g, ' ');
  s = s.replace(/\s*\(#(\d+)\)$/, ` ([#$1](${URL}/pull/$1))`);
  s = s.replace(/,?\s+and\s+release\s+v?\d+\.\d+\.\d+$/i, '');
  s = s.replace(/,?\s+release\s+v?\d+\.\d+\.\d+$/i, '');
  s = s.replace(/\s+\(v?\d+\.\d+\.\d+\)$/, '');
  return /^[a-z]/.test(s) ? s[0].toUpperCase() + s.slice(1) : s;
}

function readCommits(from, to, dir = root, paths = []) {
  const range = from ? `${from}..${to}` : to;
  const pathArgs = paths.length ? ['--', ...paths] : [];
  return gitIn(
    dir,
    'log',
    '--no-merges',
    '--reverse',
    '--format=%H%x1f%s%x1f%b%x1e',
    range,
    ...pathArgs,
  )
    .split('\x1E')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, body = ''] = record.split('\x1F');
      return { sha, subject, body: body.trim() };
    });
}

function resolveRange({ tag, previous, tags }) {
  let from = previous;
  let rows = readCommits(from, tag);
  // A tag can point at a commit older than the previous version tag; step back
  // until the range has a commit, or the release would look empty.
  while (!rows.length && from) {
    const earlier = tags.filter((t) => compareSemver(semver(t), semver(from)) < 0);
    from = earlier.at(-1) ?? null;
    rows = readCommits(from, tag);
  }
  return { from, rows };
}

function cloudCommits(dir, from, tag) {
  if (!from) fail('--cloud needs a previous version tag');
  const [start, end] = [from, tag].map((t) => `artifacts-${t}`);
  for (const t of [start, end]) {
    try {
      gitIn(dir, 'rev-parse', '-q', '--verify', `refs/tags/${t}`);
    } catch {
      fail(`ryugi-cloud has no tag ${t}`);
    }
  }
  return readCommits(start, end, dir, CLOUD_SHIPPED_PATHS)
    .filter((row) => !isReleaseCommit(row.subject))
    .filter((row) => !CLOUD_HIDDEN_SCOPES.has(parseSubject(row.subject)?.scope))
    .map((row) => ({
      ...row,
      private: true,
      files: gitIn(dir, 'show', '--name-only', '--format=', row.sha).split('\n').filter(Boolean),
    }));
}

function publicCommits(rows, scope) {
  const filtered = rows.filter((c) => !isReleaseCommit(c.subject));
  return scope ? filtered.filter((c) => parseSubject(c.subject)?.scope === scope) : filtered;
}

function footer(from, tag) {
  return from
    ? `**Full Changelog**: ${URL}/compare/${from}...${tag}`
    : `**Full Changelog**: ${URL}/commits/${tag}`;
}

function renderDeterministic({ tag, from, rows, scope, privateRows = [] }) {
  const sections = new Map();
  const seen = new Set();

  for (const row of [...publicCommits(rows, scope), ...privateRows]) {
    const parsed = parseSubject(row.subject);
    if (!parsed) continue;
    if (row.private && parsed.type === 'docs') continue;
    if (!TYPE_LABEL[parsed.type] && parsed.type !== 'docs') continue;
    const area = row.private ? privateArea(parsed, row.files, SCOPE_AREA) : areaFor(parsed);
    if (!area) continue;
    const subject = SUBJECT_OVERRIDES[row.sha] ?? parsed.subject;
    const key = `${area}\x00${subject.replace(/\s*\(#\d+\)$/, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = parsed.type === 'docs' ? null : TYPE_LABEL[parsed.type];
    const text = tidySubject(subject);
    const link = row.private ? '' : ` ([${row.sha.slice(0, 7)}](${URL}/commit/${row.sha}))`;
    const line = `- ${label ? `**${label}** — ` : ''}${text}${link}`;
    const rank = label ? LABEL_ORDER.indexOf(label) : LABEL_ORDER.length;
    if (!sections.has(area)) sections.set(area, []);
    sections.get(area).push({ rank, line });
  }

  const lines = [];
  if (!sections.size) {
    lines.push(
      publicCommits(rows, scope).length || privateRows.length
        ? 'Maintenance release: internal changes only.'
        : 'Version bump only; no user-facing changes.',
    );
  } else {
    for (const area of AREA_ORDER) {
      if (!sections.has(area)) continue;
      if (lines.length) lines.push('');
      const bullets = sections
        .get(area)
        .sort((a, b) => a.rank - b.rank)
        .map((entry) => entry.line);
      lines.push(`## ${area}`, '', ...bullets);
    }
  }
  lines.push('', footer(from, tag));
  return `${lines.join('\n')}\n`;
}

function aiCommitPayload(row) {
  if (row.private) return { private: true, subject: row.subject, body: row.body };
  let diff = git('show', '--format=', '--unified=2', '--no-color', row.sha);
  if (diff.length > 8000) diff = `${diff.slice(0, 8000)}\n[…diff truncated…]`;
  return {
    sha: row.sha,
    subject: row.subject,
    body: row.body,
    stat: git('show', '--stat', '--format=', row.sha).trim(),
    diff,
  };
}

async function callAi(tag, from, commits) {
  if (!AI_KEY) throw new Error('no API key (set RELEASE_NOTES_API_KEY)');
  let budget = 40000;
  const payload = [];
  for (const row of commits) {
    const entry = aiCommitPayload(row);
    if (entry.private) {
      payload.push(entry);
      continue;
    }
    if (entry.diff.length > budget) entry.diff = entry.diff.slice(0, budget);
    budget -= entry.diff.length;
    payload.push(entry);
  }
  const body = {
    model: AI_MODEL,
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify({ tag, previous: from, commits: payload }) },
    ],
    max_tokens: 4000,
    temperature: 0.2,
    ...(new globalThis.URL(AI_URL).hostname === 'api.deepseek.com'
      ? { thinking: { type: 'disabled' } }
      : {}),
  };
  const response = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('empty completion');
  return content;
}

function normalizeAi(text, rows, privateRows) {
  const allowed = new Map(rows.map((row) => [row.sha, row.sha]));
  for (const row of rows) allowed.set(row.sha.slice(0, 7), row.sha);
  let out = text.trim();
  if (out.startsWith('```')) out = out.replace(/^```[a-z]*\n/, '').replace(/\n```$/, '');
  if (!out) throw new Error('empty output');
  if (/^# /m.test(out)) throw new Error('h1 heading in output');
  if (out.includes('```')) throw new Error('code fence in output');
  if (/full changelog/i.test(out)) throw new Error('model wrote its own Full Changelog');
  if (/ryugi-cloud|ryugi-dev/i.test(out)) throw new Error('output names the private repository');
  out = out.replaceAll(
    /\[([^\]]*)\]\((https:\/\/github\.com\/Innei\/ryugi\/commit\/([0-9a-f]{7,40}))\)/g,
    (whole, label, _url, sha) => {
      const full = allowed.get(sha);
      if (!full) throw new Error(`unknown commit link ${sha}`);
      return `[${full.slice(0, 7)}](${URL}/commit/${full})`;
    },
  );
  for (const row of privateRows) {
    if (out.includes(row.sha.slice(0, 7)))
      throw new Error(`output carries private commit ${row.sha.slice(0, 7)}`);
  }
  const headings = [...out.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
  for (const heading of headings) {
    if (!AREA_ORDER.includes(heading)) throw new Error(`unknown section ${heading}`);
  }
  const bullets = out.split('\n').filter((line) => line.startsWith('- '));
  const oneLiner = /^(?:Version bump only\.|Maintenance release:)/.test(out);
  if (!bullets.length && !oneLiner) throw new Error('no bullets');
  if (bullets.length && !headings.length) throw new Error('bullets without a section');
  for (const bullet of bullets) {
    if (privateRows.length) break;
    if (!/\]\(https:\/\/github\.com\/Innei\/ryugi\/(?:commit|pull)\//.test(bullet)) {
      throw new Error(`bullet without a link: ${bullet.slice(0, 80)}`);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'usage: release-notes.mjs --tag <tag> [--previous <tag>] [--scope <scope>] [--cloud <dir>] [--ai | --ai-strict]',
    );
    process.exit(0);
  }
  if (!args.tag) fail('--tag is required');

  const tags = versionTags();
  const previous = previousTag(args.tag, args.previous, tags);
  const { from, rows } = resolveRange({ tag: args.tag, previous, tags });
  const privateRows = args.cloud && !args.scope ? cloudCommits(args.cloud, from, args.tag) : [];
  const deterministic = renderDeterministic({
    tag: args.tag,
    from,
    rows,
    scope: args.scope,
    privateRows,
  });

  if (!args.ai && !args['ai-strict']) {
    process.stdout.write(deterministic);
    return;
  }

  try {
    const commits = publicCommits(rows, args.scope);
    const content = normalizeAi(
      await callAi(args.tag, from, [...commits, ...privateRows]),
      commits,
      privateRows,
    );
    process.stdout.write(`${content}\n\n${footer(from, args.tag)}\n`);
  } catch (error) {
    const warning = process.env.GITHUB_ACTIONS === 'true' ? '::warning::' : '';
    console.error(`${warning}release-notes: ai failed: ${error.message}`);
    if (args['ai-strict']) process.exit(1);
    process.stdout.write(deterministic);
  }
}

await main();
