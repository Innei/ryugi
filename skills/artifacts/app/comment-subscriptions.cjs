'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const ARTIFACT = /^(?:document|artboard|whiteboard)\/[a-z0-9][a-z0-9-]*$/;
const HOSTS = {
  codex: { env: 'CODEX_THREAD_ID', dir: 'codex-comment-watch' },
  claude: { env: 'CLAUDE_CODE_SESSION_ID', dir: 'claude-comment-watch' },
  pi: { env: 'PI_SESSION_ID', dir: 'pi-comment-watch' },
};

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function projectRoot(cwd) {
  const dir = fs.realpathSync(cwd);
  const chain = [];
  for (let current = dir; ; current = path.dirname(current)) {
    chain.push(current);
    if (fs.existsSync(path.join(current, '.git')) && (current !== os.homedir() || dir === current))
      return chain.find((item) => fs.existsSync(path.join(item, '.ryugi/artifacts'))) || current;
    if (path.dirname(current) === current) return dir;
  }
}

function gitRoot(dir) {
  for (let current = dir; ; current = path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    if (path.dirname(current) === current) return null;
  }
}

// A linked worktree is its own project root, so a session can subscribe in a checkout its watcher was not started in.
function checkouts(project) {
  const roots = [project];
  try {
    const root = gitRoot(project);
    let common = path.join(root, '.git');
    if (fs.statSync(common).isFile()) {
      const gitdir = path.resolve(
        root,
        fs
          .readFileSync(common, 'utf8')
          .replace(/^gitdir:\s*/, '')
          .trim(),
      );
      common = path.resolve(gitdir, fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim());
      roots.push(path.dirname(common));
    }
    for (const name of fs.readdirSync(path.join(common, 'worktrees'))) {
      const entry = path.join(common, 'worktrees', name);
      try {
        const link = fs.readFileSync(path.join(entry, 'gitdir'), 'utf8').trim();
        roots.push(fs.realpathSync(path.dirname(path.resolve(entry, link))));
      } catch {}
    }
  } catch {}
  return [...new Set(roots)];
}

function subscriptionFile(project, host, session) {
  return path.join(project, '.ryugi/artifacts/.state', HOSTS[host].dir, `${session}.json`);
}

function aliveFile(project, host, session) {
  return path.join(project, '.ryugi/artifacts/.state', HOSTS[host].dir, `${session}.alive`);
}

function beat(project, host, session, now = Date.now()) {
  try {
    const file = aliveFile(project, host, session);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, String(now));
  } catch {
    // A missing heartbeat only makes the viewer say "tell the terminal"; never fail the watch.
  }
}

function sessionOf(host, env = process.env) {
  const session = env[HOSTS[host].env];
  return UUID.test(session || '') ? session : null;
}

// A session can open artifacts in a project its watcher was not started in; the index names each one.
function sessionIndexFile(host, session) {
  const cache = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(cache, 'ryugi', HOSTS[host].dir, `${session}.json`);
}

function sessionProjects(host, session) {
  const file = readJson(sessionIndexFile(host, session));
  return Array.isArray(file?.projects) ? file.projects.filter((p) => typeof p === 'string') : [];
}

function addSessionProject(host, session, project) {
  const projects = sessionProjects(host, session);
  if (projects.includes(project)) return;
  const file = sessionIndexFile(host, session);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ projects: [...projects, project] }), { mode: 0o600 });
}

function subscriptions(project, host, session) {
  const file = readJson(subscriptionFile(project, host, session));
  return new Set(Array.isArray(file?.artifacts) ? file.artifacts : []);
}

// The launcher knows the real argv and cwd; hook text cannot safely reconstruct shell commands.
function register(args, env = process.env) {
  const host = ['codex', 'claude', 'pi'].find((name) => sessionOf(name, env));
  if (!host) return;
  const session = sessionOf(host, env);
  const option = (name) => {
    const index = args.indexOf(name);
    return index >= 0
      ? args[index + 1]
      : args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  };
  // Claude Code's SessionStart hook runs a bare start in every session; it must not subscribe them all.
  const artifact = option('--artifact') || (host === 'codex' && args[0] === 'start' ? '*' : null);
  if (artifact !== '*' && !ARTIFACT.test(artifact || '')) return;
  const project = projectRoot(option('--project-dir') || process.cwd());
  const artifacts = subscriptions(project, host, session);
  artifacts.add(artifact);
  const file = subscriptionFile(project, host, session);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ artifacts: [...artifacts], updatedAt: new Date().toISOString() }),
    { mode: 0o600 },
  );
  addSessionProject(host, session, project);
}

module.exports = {
  aliveFile,
  beat,
  checkouts,
  projectRoot,
  register,
  sessionOf,
  sessionProjects,
  subscriptionFile,
  subscriptions,
  UUID,
};
