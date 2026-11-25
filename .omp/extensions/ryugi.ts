import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import type { ExtensionAPI, ExtensionContext } from '@oh-my-pi/pi-coding-agent';

// `process.execPath` is only a JavaScript runtime under node/bun. omp.exe embeds bun and reports itself,
// so spawning it with a script path starts a whole new omp session that loads this extension again.
export function nodeBin(execPath = process.execPath): string {
  return /(^|[\\/])(node|bun)(\.exe)?$/i.test(execPath) ? execPath : 'node';
}

const UUID = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
const EXTREMELY_IMPORTANT_MARKER = '<EXTREMELY_IMPORTANT>';
const BOOTSTRAP_MARKER = 'ryugi:using-ryugi bootstrap for omp';
const HOOK_WAIT_MS = 60_000;

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(extensionDir, '../..');
const skillsDir = resolve(packageRoot, 'skills');
const bootstrapSkillPath = resolve(skillsDir, 'using-ryugi', 'SKILL.md');

let cachedBootstrap: string | null | undefined;

export default function ryugiOmpExtension(omp: ExtensionAPI) {
  let injectBootstrap = true;
  let channel: { close: () => void } | undefined;
  let ownedSessionEnv: string | undefined;

  const stopCommentWatch = () => {
    channel?.close();
    channel = undefined;
    if (ownedSessionEnv && process.env.PI_SESSION_ID === ownedSessionEnv) {
      delete process.env.PI_SESSION_ID;
    }
    ownedSessionEnv = undefined;
  };

  omp.on('session_start', async (_event, ctx) => {
    injectBootstrap = true;
    stopCommentWatch();

    const rawSessionId = ctx.sessionManager?.getSessionId?.();
    if (!rawSessionId) return;

    const sessionUuid = toSessionUuid(rawSessionId);
    const hasOuterHost = Boolean(
      process.env.CLAUDE_CODE_SESSION_ID ||
        process.env.CODEX_THREAD_ID ||
        process.env.ANTIGRAVITY_CONVERSATION_ID ||
        process.env.PI_SESSION_ID,
    );

    // Expose session UUID to child bash calls (`ryugi.cjs start --artifact ...`) when OMP is the top host.
    if (!hasOuterHost) {
      process.env.PI_SESSION_ID = sessionUuid;
      ownedSessionEnv = sessionUuid;
      channel = watchComments(omp, ctx, ctx.cwd, sessionUuid);
    }
  });

  omp.on('session_shutdown', async () => {
    stopCommentWatch();
  });

  omp.on('session_compact', async () => {
    injectBootstrap = true;
  });

  omp.on('agent_end', async () => {
    injectBootstrap = false;
  });

  omp.on('context', async (event) => {
    if (!injectBootstrap) return;
    if (event.messages.some(messageContainsBootstrap)) return;

    const bootstrap = getBootstrapContent();
    if (!bootstrap) return;

    const bootstrapMessage = {
      role: 'user' as const,
      content: [{ type: 'text' as const, text: bootstrap }],
      timestamp: Date.now(),
    };

    const insertAt = firstNonCompactionSummaryIndex(event.messages);
    return {
      messages: [
        ...event.messages.slice(0, insertAt),
        bootstrapMessage,
        ...event.messages.slice(insertAt),
      ],
    };
  });
}

export function toSessionUuid(sessionId: string): string {
  if (UUID.test(sessionId)) return sessionId;
  const hash = createHash('sha256').update(`omp:${sessionId}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

function executable(file: string): boolean {
  try {
    const stat = statSync(file);
    if (!stat.isFile()) return false;
    return process.platform === 'win32' ? true : (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function resolveHookCandidate(basePath: string): string | null {
  if (executable(basePath)) return basePath;
  if (process.platform === 'win32' && !basePath.endsWith('.exe')) {
    const exe = `${basePath}.exe`;
    if (executable(exe)) return exe;
  }
  return null;
}

function hookBin(): string | null {
  const override = process.env.RYUGI_HOOK_BIN;
  if (override) return resolveHookCandidate(override);
  const local = resolveHookCandidate(join(packageRoot, 'hook', 'target', 'release', 'ryugi-hook'));
  if (local) return local;
  let version: string | undefined;
  try {
    version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
  return resolveHookCandidate(join(homedir(), '.ryugi', 'hook', String(version), 'ryugi-hook'));
}

function requestHookInstall() {
  try {
    spawn(nodeBin(), [join(skillsDir, 'artifacts', 'app', 'ryugi.cjs'), 'hook-install'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch {}
}

function watchComments(omp: ExtensionAPI, ctx: ExtensionContext, cwd: string, session: string) {
  let reported: string | undefined;
  const report = (error: unknown) => {
    const message = `Ryugi comment watch: ${error instanceof Error ? error.message : String(error)}`;
    if (message === reported) return;
    reported = message;
    try {
      ctx.ui.notify(message, 'warning');
    } catch {
      console.error(message);
    }
  };

  let closed = false;
  let child: ReturnType<typeof spawn> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const start = (bin: string) => {
    const watcher = spawn(bin, ['watch', 'pi', cwd, session], {
      env: { ...process.env, RYUGI_PLUGIN_ROOT: packageRoot },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    child = watcher;
    watcher.on('error', report);
    watcher.stdin?.on('error', () => {});
    createInterface({ input: watcher.stdout! }).on('line', (line) => {
      let event: { id: unknown; type: string; content: string };
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      try {
        Promise.resolve(
          omp.sendMessage(
            { customType: event.type, content: event.content, display: true },
            { triggerTurn: true, deliverAs: 'followUp' },
          ),
        ).then(() => watcher.stdin?.write(`${JSON.stringify({ delivered: event.id })}\n`), report);
      } catch (error) {
        report(error);
      }
    });
  };

  // OMP starts the watch once per session, so a first-run hook download is waited out rather than skipped.
  const deadline = Date.now() + HOOK_WAIT_MS;
  const attempt = (first: boolean) => {
    if (closed) return;
    const bin = hookBin();
    if (bin) return start(bin);
    if (first) requestHookInstall();
    if (Date.now() < deadline) timer = setTimeout(() => attempt(false), 1000);
  };
  attempt(true);

  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      child?.kill();
    },
  };
}

export function getBootstrapContent(): string | null {
  if (cachedBootstrap !== undefined) return cachedBootstrap;

  try {
    const skillContent = readFileSync(bootstrapSkillPath, 'utf8');
    const body = stripFrontmatter(skillContent);
    cachedBootstrap = `${EXTREMELY_IMPORTANT_MARKER}
${BOOTSTRAP_MARKER}

You have Ryugi.

The using-ryugi skill content is included below and is already loaded for this OMP session. Follow it now. Do not try to load using-ryugi again.

${body}

${ompToolMapping()}
</EXTREMELY_IMPORTANT>`;
    return cachedBootstrap;
  } catch {
    cachedBootstrap = null;
    return null;
  }
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/);
  return (match ? match[1] : content).trim();
}

export function ompToolMapping(): string {
  return `## OMP tool mapping

OMP discovers installed skills automatically but does not expose a separate \`Skill\` tool. When a Ryugi instruction says to invoke a skill (such as \`ryugi:brainstorming\`, \`ryugi:artifacts\`, \`ryugi:executing-specs\`, \`ryugi:test-driven-development\`, \`ryugi:systematic-debugging\`, or \`ryugi:verifying\`), load it with \`read\` using \`skill://<name>\` (or read its \`SKILL.md\` path directly). Using \`read\` is the native skill-loading mechanism on OMP.

OMP's built-in coding tools are lowercase:
- Read a file, read a skill, or fetch a URL: \`read\` (supports local paths, \`skill://<name>\`, and \`http(s)://\` URLs)
- Create or edit a file: \`write\`, \`edit\` (and \`ast_edit\` for structural edits)
- Run a shell command: \`bash\`
- Search file contents / find files by name: \`grep\`, \`glob\` / \`find\` (and \`ast_grep\` for AST queries)
- Search the web: \`web_search\`
- Ask your human partner a structured question: \`ask\`
- Create / update todos (treat older \`TodoWrite\` references as this): \`todo\`
- Dispatch a subagent (\`Subagent (general-purpose):\` template): \`task\` (with \`wait\` when awaiting async subagents)`;
}

function messageContainsBootstrap(message: unknown): boolean {
  const content = (message as { content?: unknown })?.content;
  if (typeof content === 'string') {
    return content.includes(BOOTSTRAP_MARKER) || content.includes(EXTREMELY_IMPORTANT_MARKER);
  }
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    const text =
      part && typeof part === 'object' && (part as { type?: unknown }).type === 'text'
        ? (part as { text?: unknown }).text
        : null;
    return (
      typeof text === 'string' &&
      (text.includes(BOOTSTRAP_MARKER) || text.includes(EXTREMELY_IMPORTANT_MARKER))
    );
  });
}

function firstNonCompactionSummaryIndex(messages: unknown[]): number {
  let index = 0;
  while ((messages[index] as { role?: unknown } | undefined)?.role === 'compactionSummary') {
    index += 1;
  }
  return index;
}
