import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../scripts/release-notes.mjs',
);
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-notes-'));
const pub = path.join(root, 'ryugi');
const cloud = path.join(root, 'ryugi-cloud');
const shas = {};

const git = (dir, ...args) =>
  execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim();

function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'tag.gpgsign', 'false');
}

function commit(dir, subject, files) {
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', subject);
  return git(dir, 'rev-parse', 'HEAD');
}

function run(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      'node',
      ['scripts/release-notes.mjs', ...args],
      { cwd: pub, env: { ...process.env, GITHUB_ACTIONS: '', ...env } },
      (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }),
    );
  });
}

function stub(reply) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      requests.push(JSON.parse(body));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content: reply(requests.at(-1)) } }] }));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: 'http://127.0.0.1:' + server.address().port + '/chat/completions',
        requests,
        close: () => server.close(),
      }),
    ),
  );
}

before(() => {
  init(pub);
  fs.mkdirSync(path.join(pub, 'scripts'));
  for (const name of ['release-notes.mjs', 'release-notes-cloud.mjs']) {
    fs.copyFileSync(path.join(path.dirname(SCRIPT), name), path.join(pub, 'scripts', name));
  }
  commit(pub, 'chore: init', { 'README.md': 'ryugi\n' });
  git(pub, 'tag', 'v1.0.0');
  shas.skills = commit(pub, 'feat(skills): brainstorming asks one question at a time', {
    'skills/brainstorming/SKILL.md': 'one question\n',
  });
  commit(pub, 'chore: release 1.1.0', { 'package.json': '{"version":"1.1.0"}\n' });
  git(pub, 'tag', 'v1.1.0');

  init(cloud);
  commit(cloud, 'chore: init', { 'README.md': 'cloud\n' });
  git(cloud, 'tag', 'artifacts-v1.0.0');
  shas.hub = commit(cloud, 'feat(hub): the hub restarts itself after an update', {
    'packages/artifacts/src/core/server/restart.ts': 'export const restart = 1;\n',
  });
  shas.verify = commit(cloud, 'fix(verify): evidence tables wrap long cells', {
    'packages/artifacts/src/verify/table.tsx': 'export const wrap = 1;\n',
  });
  shas.link = commit(cloud, 'feat(cloud): a published link opens on the latest version', {
    'packages/artifacts/src/core/cli/commands/publish/open.ts': 'export const open = 1;\n',
  });
  shas.daemon = commit(cloud, 'feat(daemon): the daemon resumes a session after sleep', {
    'daemon/src/main.rs': 'fn main() {}\n',
  });
  shas.web = commit(cloud, 'feat(web): the dashboard shows team spaces', {
    'web/src/spaces.tsx': 'export const spaces = 1;\n',
  });
  commit(cloud, 'chore(artifacts): release 1.1.0', {
    'packages/artifacts/package.json': '{"version":"1.1.0"}\n',
  });
  git(cloud, 'tag', 'artifacts-v1.1.0');
});

after(() => fs.rmSync(root, { recursive: true, force: true }));

test('private changes from ryugi-cloud land in their sections without a link', async () => {
  const { code, stdout } = await run(['--tag', 'v1.1.0', '--cloud', cloud]);
  assert.equal(code, 0);
  const sections = [...stdout.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(sections, ['Hub & CLI', 'Viewer', 'Cloud links', 'Daemon', 'Skills']);
  assert.match(stdout, /^- \*\*New\*\* — The hub restarts itself after an update$/m);
  assert.match(stdout, /^- \*\*Fix\*\* — Evidence tables wrap long cells$/m);
  assert.match(stdout, /^- \*\*New\*\* — A published link opens on the latest version$/m);
  assert.match(stdout, /^- \*\*New\*\* — The daemon resumes a session after sleep$/m);
  assert.ok(stdout.includes('/commit/' + shas.skills + ')'));
});

test('cloud changes outside what ships, and cloud release commits, stay out', async () => {
  const { stdout } = await run(['--tag', 'v1.1.0', '--cloud', cloud]);
  assert.doesNotMatch(stdout, /dashboard shows team spaces/);
  assert.doesNotMatch(stdout, /release 1\.1\.0/i);
  for (const sha of [shas.hub, shas.verify, shas.link, shas.daemon]) {
    assert.ok(!stdout.includes(sha.slice(0, 7)), 'private sha ' + sha + ' leaked');
  }
  assert.doesNotMatch(stdout, /ryugi-cloud|ryugi-dev/);
});

test('a missing ryugi-cloud tag stops the note instead of leaving the changes out', async () => {
  git(cloud, 'tag', '-d', 'artifacts-v1.0.0');
  try {
    const { code, stderr } = await run(['--tag', 'v1.1.0', '--cloud', cloud]);
    assert.notEqual(code, 0);
    assert.match(stderr, /artifacts-v1\.0\.0/);
  } finally {
    git(cloud, 'tag', 'artifacts-v1.0.0', 'HEAD~6');
  }
});

test('the AI sees private commits by subject and body only, never their diff', async () => {
  const server = await stub(
    () =>
      '## Skills\n\n- **One question** — Asked one at a time. ([x](https://github.com/Innei/ryugi/commit/' +
      shas.skills +
      '))',
  );
  try {
    await run(['--tag', 'v1.1.0', '--cloud', cloud, '--ai-strict'], {
      RELEASE_NOTES_API_URL: server.url,
      RELEASE_NOTES_API_KEY: 'test-key',
    });
    const [request] = server.requests;
    assert.equal(request.model, 'deepseek-flash');
    const commits = JSON.parse(request.messages[1].content).commits;
    const hub = commits.find((c) => c.subject.includes('hub restarts'));
    assert.equal(hub.private, true);
    assert.equal(hub.sha, undefined);
    assert.equal(hub.diff, undefined);
    assert.equal(hub.stat, undefined);
    const skills = commits.find((c) => c.sha === shas.skills);
    assert.ok(skills.diff.includes('one question'));
    assert.ok(!commits.some((c) => c.subject.includes('team spaces')));
  } finally {
    server.close();
  }
});

test('an AI bullet about a private change needs no link', async () => {
  const note = [
    '## Hub & CLI',
    '',
    '- **Hub restarts itself** — After an update the hub comes back on its own.',
    '',
    '## Skills',
    '',
    '- **One question** — Brainstorming asks one at a time. ([abc](https://github.com/Innei/ryugi/commit/' +
      shas.skills +
      '))',
  ].join('\n');
  const server = await stub(() => note);
  try {
    const { code, stdout } = await run(['--tag', 'v1.1.0', '--cloud', cloud, '--ai-strict'], {
      RELEASE_NOTES_API_URL: server.url,
      RELEASE_NOTES_API_KEY: 'test-key',
    });
    assert.equal(code, 0);
    assert.match(stdout, /Hub restarts itself/);
    assert.match(
      stdout,
      /\*\*Full Changelog\*\*: https:\/\/github\.com\/Innei\/ryugi\/compare\/v1\.0\.0\.\.\.v1\.1\.0/,
    );
  } finally {
    server.close();
  }
});

test('an AI note that links a private commit falls back to the template note', async () => {
  const server = await stub(
    () =>
      '## Hub & CLI\n\n- **Hub restarts** — It comes back. ([x](https://github.com/Innei/ryugi/commit/' +
      shas.hub +
      '))',
  );
  try {
    const { code, stdout, stderr } = await run(['--tag', 'v1.1.0', '--cloud', cloud, '--ai'], {
      RELEASE_NOTES_API_URL: server.url,
      RELEASE_NOTES_API_KEY: 'test-key',
    });
    assert.equal(code, 0);
    assert.match(stderr, /ai failed/);
    assert.match(stdout, /^- \*\*New\*\* — The hub restarts itself after an update$/m);
  } finally {
    server.close();
  }
});

test('an AI note with an unlinked bullet and no private changes falls back', async () => {
  const server = await stub(() => '## Skills\n\n- **One question** — Asked one at a time.');
  try {
    const { stdout, stderr } = await run(['--tag', 'v1.1.0', '--ai'], {
      RELEASE_NOTES_API_URL: server.url,
      RELEASE_NOTES_API_KEY: 'test-key',
    });
    assert.match(stderr, /ai failed: bullet without a link/);
    assert.ok(stdout.includes('/commit/' + shas.skills + ')'));
  } finally {
    server.close();
  }
});
