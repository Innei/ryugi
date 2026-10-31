'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const ARTIFACT = /^(?:document|artboard)\/[a-z0-9][a-z0-9-]*$/;
const HOSTS = {
  codex: { env: 'CODEX_THREAD_ID', dir: 'codex-comment-watch' },
  claude: { env: 'CLAUDE_CODE_SESSION_ID', dir: 'claude-comment-watch' },
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

function subscriptionFile(project, host, session) {
  return path.join(project, '.ryugi/artifacts/.state', HOSTS[host].dir, `${session}.json`);
}

function sessionOf(host, env = process.env) {
  const session = env[HOSTS[host].env];
  return UUID.test(session || '') ? session : null;
}

function subscriptions(project, host, session) {
  const file = readJson(subscriptionFile(project, host, session));
  return new Set(Array.isArray(file?.artifacts) ? file.artifacts : []);
}

// The launcher knows the real argv and cwd; hook text cannot safely reconstruct shell commands.
function register(args, env = process.env) {
  const host = sessionOf('codex', env) ? 'codex' : sessionOf('claude', env) ? 'claude' : null;
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
}

module.exports = { projectRoot, register, sessionOf, subscriptionFile, subscriptions, UUID };
