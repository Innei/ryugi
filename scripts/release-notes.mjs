#!/usr/bin/env node
// Generates a Ryugi plugin release note from conventional commits.
//
//   node scripts/release-notes.mjs --tag v1.98.0
//   node scripts/release-notes.mjs --tag v1.98.0 --previous v1.97.0
//   node scripts/release-notes.mjs --tag detect-agent-v0.1.0 --previous v1.46.0 --scope detect-agent
//
// Markdown goes to stdout. The previous tag is the greatest lower vX.Y.Z tag
// unless --previous names one; a tag whose range is empty (tags created out of
// order) steps back until a commit is found.

import { execFileSync } from 'node:child_process';

const REPO = 'Innei/ryugi';
const URL = `https://github.com/${REPO}`;
const AREA_ORDER = ['Artifacts', 'Skills', 'Hosts', 'Detect agent', 'Docs', 'Brand', 'Other'];
const LABEL_ORDER = ['New', 'Fix', 'Improved'];

const SCOPE_AREA = {
  'artifacts': 'Artifacts',
  'viewer': 'Artifacts',
  'document': 'Artifacts',
  'runtime': 'Artifacts',
  'cli': 'Artifacts',
  'cloud': 'Artifacts',
  'server': 'Artifacts',
  'preview': 'Artifacts',
  'plugin': 'Artifacts',
  'daemon': 'Artifacts',
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

// Release tooling and CI changes stay out of the notes; dependencies and
// internal refactors only reach a release as "Maintenance release".
const HIDDEN_SCOPES = new Set(['release', 'ci']);
const TYPE_LABEL = { feat: 'New', fix: 'Fix', perf: 'Improved', style: 'Improved' };

// The one historical commit whose subject git truncated. Its diff adds the
// storyboard type and makes comment watchers wake an agent on a storyboard.
const SUBJECT_OVERRIDES = {
  '42084c1f1382cb8e5b28ef8c6281d6f622a89786':
    'the storyboard type: a row in the type table for product demo videos, and comments on storyboards wake the agent',
};

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    const name = key.slice(2);
    if (name === 'help') return { help: true };
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
  return /^chore(?:\(release\))?: (?:release|v?\d)/.test(subject);
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

function readCommits(from, to) {
  const range = from ? `${from}..${to}` : to;
  return git('log', '--no-merges', '--reverse', '--format=%H%x1f%s', range)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split('\x1F');
      return { sha, subject };
    });
}

function render({ tag, previous, scope, tags }) {
  let from = previous;
  let rows = readCommits(from, tag);
  // A tag can point at a commit older than the previous version tag; step back
  // until the range has a commit, or the release would look empty.
  while (!rows.length && from) {
    const earlier = tags.filter((t) => compareSemver(semver(t), semver(from)) < 0);
    from = earlier.at(-1) ?? null;
    rows = readCommits(from, tag);
  }

  const filtered = rows.filter((c) => !isReleaseCommit(c.subject));
  const scoped = scope
    ? filtered.filter((c) => parseSubject(c.subject)?.scope === scope)
    : filtered;
  const sections = new Map();
  const seen = new Set();

  for (const row of scoped) {
    const parsed = parseSubject(row.subject);
    if (!parsed) continue;
    if (!TYPE_LABEL[parsed.type] && parsed.type !== 'docs') continue;
    const area = areaFor(parsed);
    if (!area) continue;
    const subject = SUBJECT_OVERRIDES[row.sha] ?? parsed.subject;
    const key = `${area}\x00${subject.replace(/\s*\(#\d+\)$/, '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const label = parsed.type === 'docs' ? null : TYPE_LABEL[parsed.type];
    const text = tidySubject(subject);
    const line = `- ${label ? `**${label}** — ` : ''}${text} ([${row.sha.slice(0, 7)}](${URL}/commit/${row.sha}))`;
    const rank = label ? LABEL_ORDER.indexOf(label) : LABEL_ORDER.length;
    if (!sections.has(area)) sections.set(area, []);
    sections.get(area).push({ rank, line });
  }

  const lines = [];
  if (!sections.size) {
    lines.push(
      filtered.length
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
  lines.push('');
  lines.push(
    from
      ? `**Full Changelog**: ${URL}/compare/${from}...${tag}`
      : `**Full Changelog**: ${URL}/commits/${tag}`,
  );
  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log('usage: release-notes.mjs --tag <tag> [--previous <tag>] [--scope <scope>]');
  process.exit(0);
}
if (!args.tag) fail('--tag is required');
const tags = versionTags();
const previous = previousTag(args.tag, args.previous, tags);
process.stdout.write(render({ tag: args.tag, previous, scope: args.scope, tags }));
