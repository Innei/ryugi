import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

// `process.execPath` is only a JavaScript runtime under node/bun. Hosts that embed bun in a compiled
// binary (omp.exe) report themselves, so spawning it with a script path starts a whole new host session.
function nodeBin() {
  return /(?:^|[\\/])(?:node|bun)(?:\.exe)?$/i.test(process.execPath) ? process.execPath : 'node';
}


const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

export const name = 'ryugi';
export const inject = [];

const EXTREMELY_IMPORTANT_MARKER = '<EXTREMELY_IMPORTANT>';
const BOOTSTRAP_MARKER = 'ryugi:using-ryugi bootstrap for dsh';
const SOURCE_KIND = `plugin:${name}`;
const BUNDLED_SKILL_RANK = 600;

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pluginDir, '..');
const skillsRoot = path.resolve(repoRoot, 'skills');
const bootstrapSkillPath = path.resolve(skillsRoot, 'using-ryugi', 'SKILL.md');

function executable(file) {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function hookBin() {
  const override = process.env.RYUGI_HOOK_BIN;
  if (override) return executable(override) ? override : null;
  const local = path.join(repoRoot, 'hook', 'target', 'release', 'ryugi-hook');
  if (executable(local)) return local;
  let version;
  try {
    version = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
  const cached = path.join(os.homedir(), '.ryugi', 'hook', String(version), 'ryugi-hook');
  if (executable(cached)) return cached;
  if (!installRequested) {
    installRequested = true;
    try {
      spawn(
        nodeBin(),
        [path.join(skillsRoot, 'artifacts', 'app', 'ryugi.cjs'), 'hook-install'],
        { detached: true, stdio: 'ignore' },
      ).unref();
    } catch {}
  }
  return null;
}

let installRequested = false;

function hasArtifacts(workspace) {
  let start;
  try {
    start = fs.realpathSync(workspace);
  } catch {
    return false;
  }
  let home = null;
  try {
    home = fs.realpathSync(os.homedir());
  } catch {}
  const chain = [];
  for (let dir = start; ; dir = path.dirname(dir)) {
    chain.push(dir);
    if (fs.existsSync(path.join(dir, '.git')) && (dir !== home || dir === start)) break;
    if (path.dirname(dir) === dir) return fs.existsSync(path.join(start, '.ryugi', 'artifacts'));
  }
  return chain.some((dir) => fs.existsSync(path.join(dir, '.ryugi', 'artifacts')));
}

let cachedBootstrap;

function service(ctx, key) {
  try {
    return ctx?.[key];
  } catch {
    return undefined;
  }
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

export function stripFrontmatter(content) {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (match ? match[1] : content).trim();
}

export function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return {};
  const meta = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const idx = rawLine.indexOf(':');
    if (idx <= 0) continue;
    const key = rawLine.slice(0, idx).trim();
    let val = rawLine.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) meta[key] = val;
  }
  return meta;
}

export function toSessionUuid(sessionId) {
  if (typeof sessionId === 'string' && UUID.test(sessionId)) return sessionId;
  const hash = createHash('sha256')
    .update(`dsh:${String(sessionId)}`)
    .digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

export function dshToolMapping(sessionUuid) {
  const sessionNote = sessionUuid
    ? `\n\nFor live browser comment delivery back into this DSH session, prefix \`ryugi.cjs start --artifact ...\` commands in \`bash\` with \`PI_SESSION_ID=${sessionUuid}\` (or in \`pwsh\` set \`$env:PI_SESSION_ID="${sessionUuid}"\`).`
    : '';

  return `## DeepSeek Harness (DSH) tool mapping

Skills speak in actions rather than naming one runtime's tools. On DeepSeek Harness these resolve to:

- Invoke a skill (\`Skill\` tool): call DSH's native \`skill\` tool with the Ryugi skill name, replacing \`:\` with \`-\` because DSH skill names use kebab-case (for example \`ryugi:brainstorming\` → \`ryugi-brainstorming\`, \`ryugi:artifacts\` → \`ryugi-artifacts\`, \`ryugi:executing-specs\` → \`ryugi-executing-specs\`, \`ryugi:test-driven-development\` → \`ryugi-test-driven-development\`, \`ryugi:systematic-debugging\` → \`ryugi-systematic-debugging\`, \`ryugi:verifying\` → \`ryugi-verifying\`, \`ryugi:using-git-worktrees\` → \`ryugi-using-git-worktrees\`, \`ryugi:interface-craft\` → \`ryugi-interface-craft\`, \`ryugi:design-system\` → \`ryugi-design-system\`).
- Read a file: \`read\` (and \`read_image\` for images)
- Create a file: \`write\`
- Edit a file: \`edit\` (or \`apply_patch\` for multi-hunk patches)
- Run a shell command: \`bash\` (or \`pwsh\` on Windows; manage background jobs with \`job_list\`, \`job_output\`, \`job_kill\`)
- Search file contents / find files by name: \`grep\`, \`glob\`
- Fetch a URL / search the web: \`web_fetch\`, \`web_search\`
- Ask your human partner a structured question: \`ask_user_question\`
- Create / update todos (treat older \`TodoWrite\` references as this): \`todo_write\`
- Dispatch a subagent (\`Subagent (general-purpose):\` template): \`subagent\` (and \`subagent_fork\`, \`wait_agent\`, \`send_message\`, \`list_agents\` when coordinating multiple agents)${sessionNote}`;
}

export function getBootstrapContent(sessionUuid) {
  if (cachedBootstrap === undefined) {
    try {
      const raw = fs.readFileSync(bootstrapSkillPath, 'utf8');
      cachedBootstrap = stripFrontmatter(raw);
    } catch {
      cachedBootstrap = null;
    }
  }
  if (!cachedBootstrap) return null;

  return `${EXTREMELY_IMPORTANT_MARKER}
${BOOTSTRAP_MARKER}

You have Ryugi.

The using-ryugi skill content is included below and is already loaded for this DeepSeek Harness session. Follow it now. Do not try to load using-ryugi again. For all other skills, use DSH's native \`skill\` tool.

${cachedBootstrap}

${dshToolMapping(sessionUuid)}
</EXTREMELY_IMPORTANT>`;
}

export function createDshUserMessage(text, form = 'snapshot', summary = 'Ryugi bootstrap') {
  return Object.freeze({
    role: 'user',
    id: randomUUID(),
    content: Object.freeze([Object.freeze({ type: 'text', text })]),
    source: Object.freeze({
      kind: SOURCE_KIND,
      form,
      summary: String(summary).slice(0, 200),
    }),
  });
}

function messageHasBootstrap(message) {
  if (!message || typeof message !== 'object') return false;
  if (message.source?.kind === SOURCE_KIND && message.source?.form === 'snapshot') return true;
  const content = message.content;
  if (typeof content === 'string') {
    return content.includes(BOOTSTRAP_MARKER) || content.includes(EXTREMELY_IMPORTANT_MARKER);
  }
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    const text = part && typeof part === 'object' ? part.text : null;
    return (
      typeof text === 'string' &&
      (text.includes(BOOTSTRAP_MARKER) || text.includes(EXTREMELY_IMPORTANT_MARKER))
    );
  });
}

function sessionHasVisibleBootstrap(session, decisionMessages) {
  if (Array.isArray(decisionMessages) && decisionMessages.some(messageHasBootstrap)) return true;
  try {
    const visible = session?.deriveMessages?.();
    if (Array.isArray(visible) && visible.some(messageHasBootstrap)) return true;
  } catch {
    // Ignore session projection errors and fall back to decisionMessages check.
  }
  return false;
}

function isDelegatedSubagent(agent) {
  const header = agent?.session?.header;
  return Boolean(
    header?.parentId || header?.parentSessionId || agent?.parentId || agent?.parentSessionId,
  );
}

export function createRyugiSkillProvider(rootDir = skillsRoot) {
  const discover = () => {
    let entries;
    try {
      entries = fs.readdirSync(rootDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(rootDir, entry.name);
      const skillFile = path.join(skillDir, 'SKILL.md');
      if (!fs.existsSync(skillFile)) continue;
      let meta;
      try {
        meta = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
      } catch {
        continue;
      }
      const baseName = (meta.name || entry.name).replace(/^ryugi[:-]/, '');
      const fullName = `ryugi-${baseName}`;
      candidates.push({
        name: fullName,
        description: meta.description || `Ryugi ${baseName} skill`,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: 'dsh-plugin-ryugi',
        source: 'bundled',
        rank: BUNDLED_SKILL_RANK,
        path: skillFile,
        resourceBase: { kind: 'directory', path: toPosix(skillDir) },
      });
    }
    return candidates.sort((a, b) => a.name.localeCompare(b.name));
  };

  return {
    name: 'dsh-plugin-ryugi',
    list: () => Promise.resolve(discover()),
    async get(asked, options) {
      const candidates = discover();
      const rawName = typeof asked === 'string' ? asked : asked?.name;
      const normalized = typeof rawName === 'string' ? rawName.replace(/^ryugi:/, 'ryugi-') : '';
      const found =
        candidates.find((c) => c.name === normalized) ||
        candidates.find((c) => c.name === `ryugi-${normalized}`);
      if (!found) return undefined;
      const summary = { ...found };
      delete summary.rank;
      const raw = await readFile(found.path, {
        encoding: 'utf8',
        ...(options?.signal ? { signal: options.signal } : {}),
      });
      return {
        ...summary,
        content: stripFrontmatter(raw),
      };
    },
  };
}

function deliverWake(agent, message) {
  if (!agent) return false;
  if (agent.status === 'idle' && typeof agent.followup === 'function') {
    agent.followup(message);
    return true;
  }
  if (typeof agent.inject === 'function') {
    agent.inject(message);
    return true;
  }
  if (typeof agent.followup === 'function') {
    agent.followup(message);
    return true;
  }
  return false;
}

export function apply(ctx, config = {}) {
  const log = (level, msg) => ctx?.logger?.[level]?.(`ryugi: ${msg}`);
  const channels = new Map();

  // 1. Register all bundled Ryugi skills with DSH's native `skill` service.
  ctx.inject?.(['skills'], (sub) => {
    try {
      sub.skills.registerProvider(() => createRyugiSkillProvider(skillsRoot));
    } catch (error) {
      log('warn', `failed to register skills provider: ${error.message}`);
    }
  });

  const resolveAgent = async (sessionId) => {
    if (!sessionId) return undefined;
    const live = service(ctx, 'agents')?.get?.(sessionId);
    if (live) return live;
    const controller = service(ctx, 'sessionController');
    return typeof controller?.resolveAgent === 'function'
      ? await controller.resolveAgent(sessionId)
      : undefined;
  };

  const resolveWorkspace = async (agent, signal) => {
    const wd = service(ctx, 'workingDirectory');
    if (agent && typeof wd?.ensure === 'function') {
      try {
        const dir = await wd.ensure(agent, signal);
        if (typeof dir === 'string' && dir) return dir;
      } catch {
        // Fall back to session metadata.
      }
    }
    const sid = agent?.id;
    const record = sid ? service(ctx, 'sessions')?.get?.(sid) : undefined;
    return record?.meta?.cwd ?? record?.cwd ?? config.workspace ?? process.cwd();
  };

  const ensureCommentChannel = (sessionId, workspace) => {
    if (!sessionId || !workspace || channels.has(sessionId) || !hasArtifacts(workspace)) return;
    const bin = hookBin();
    if (!bin) return;
    const watcher = spawn(bin, ['watch', 'dsh', workspace, toSessionUuid(sessionId)], {
      env: { ...process.env, RYUGI_PLUGIN_ROOT: repoRoot },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const channel = { close: () => watcher.kill() };
    channels.set(sessionId, channel);
    watcher.on('error', (error) => log('warn', `comment watch failed: ${error.message}`));
    watcher.on('exit', () => {
      if (channels.get(sessionId) === channel) channels.delete(sessionId);
    });
    watcher.stdin.on('error', () => {});
    createInterface({ input: watcher.stdout }).on('line', (line) => {
      void (async () => {
        try {
          const event = JSON.parse(line);
          const agent = await resolveAgent(sessionId);
          if (!agent) return;
          const msg = createDshUserMessage(
            event.content,
            'notice',
            `Ryugi ${event.type}: ${event.artifact}`,
          );
          if (deliverWake(agent, msg))
            watcher.stdin.write(`${JSON.stringify({ delivered: event.id })}\n`);
        } catch (error) {
          log('warn', `comment delivery failed: ${error.message}`);
        }
      })();
    });
  };

  // 2. Inject `using-ryugi` bootstrap as a user-role message (deduped & compaction-aware).
  ctx.on?.(
    'agent/pre-step',
    async ({ agent, signal }, next) => {
      const decision = await next();
      if (!decision || decision.kind === 'reject' || signal?.aborted) return decision;

      const sessionId = agent?.id ?? agent?.session?.header?.id;
      if (sessionId) {
        void resolveWorkspace(agent, signal)
          .then((ws) => ensureCommentChannel(sessionId, ws))
          .catch(() => {});
      }

      if (isDelegatedSubagent(agent)) return decision;
      if (sessionHasVisibleBootstrap(agent?.session, decision.messages)) return decision;

      const sessionUuid = sessionId ? toSessionUuid(sessionId) : undefined;
      const bootstrap = getBootstrapContent(sessionUuid);
      if (!bootstrap) return decision;

      const bootstrapMsg = createDshUserMessage(
        bootstrap,
        'snapshot',
        'Ryugi workflow bootstrap and DSH tool mapping.',
      );
      const messages = Array.isArray(decision.messages) ? decision.messages : [];
      return { ...decision, messages: [bootstrapMsg, ...messages] };
    },
    { prepend: true },
  );

  ctx.effect?.(() => () => {
    for (const channel of channels.values()) {
      try {
        channel.close();
      } catch {
        // Ignore cleanup errors.
      }
    }
    channels.clear();
  });
}
