import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

// `process.execPath` is only a JavaScript runtime under node/bun. omp.exe embeds bun and reports itself,
// so spawning it with a script path starts a whole new omp session that loads this extension again.
function nodeBin(): string {
  return /(?:^|[\\/])(?:node|bun)(?:\.exe)?$/i.test(process.execPath) ? process.execPath : 'node';
}

const EXTREMELY_IMPORTANT_MARKER = '<EXTREMELY_IMPORTANT>';
const BOOTSTRAP_MARKER = 'ryugi:using-ryugi bootstrap for pi';

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(extensionDir, '../..');
const skillsDir = resolve(packageRoot, 'skills');
const bootstrapSkillPath = resolve(skillsDir, 'using-ryugi', 'SKILL.md');

let cachedBootstrap: string | null | undefined;

export default function ryugiPiExtension(pi: ExtensionAPI) {
  let injectBootstrap = true;
  let channel: { close: () => void } | undefined;

  const stopCommentWatch = () => {
    channel?.close();
    channel = undefined;
  };

  pi.on('session_start', async (_event, ctx) => {
    injectBootstrap = true;
    stopCommentWatch();
    channel = watchComments(pi, ctx, ctx.cwd, ctx.sessionManager.getSessionId());
  });

  pi.on('session_shutdown', async () => {
    stopCommentWatch();
  });

  pi.on('session_compact', async () => {
    injectBootstrap = true;
  });

  pi.on('agent_end', async () => {
    injectBootstrap = false;
  });

  pi.on('context', async (event) => {
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

const HOOK_WAIT_MS = 60_000;

function executable(file: string) {
  try {
    const stat = statSync(file);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function hookBin(): string | null {
  const override = process.env.RYUGI_HOOK_BIN;
  if (override) return executable(override) ? override : null;
  const local = join(packageRoot, 'hook', 'target', 'release', 'ryugi-hook');
  if (executable(local)) return local;
  let version: string | undefined;
  try {
    version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
  const cached = join(homedir(), '.ryugi', 'hook', String(version), 'ryugi-hook');
  return executable(cached) ? cached : null;
}

function requestHookInstall() {
  try {
    spawn(nodeBin(), [join(skillsDir, 'artifacts', 'app', 'ryugi.cjs'), 'hook-install'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  } catch {}
}

function watchComments(pi: ExtensionAPI, ctx: ExtensionContext, cwd: string, session: string) {
  // A throw escaping a child-process callback is an uncaughtException, which exits Pi. Report each
  // distinct failure once instead, because the same one usually repeats on every event.
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
        // Typed as void, but a host may hand back a promise; its rejection must not escape either.
        Promise.resolve(
          pi.sendMessage(
            { customType: event.type, content: event.content, display: true },
            { triggerTurn: true, deliverAs: 'followUp' },
          ),
        ).then(() => watcher.stdin?.write(`${JSON.stringify({ delivered: event.id })}\n`), report);
      } catch (error) {
        report(error);
      }
    });
  };
  // Pi starts the watch once per session, so a first-run download is waited out rather than skipped.
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

function getBootstrapContent(): string | null {
  if (cachedBootstrap !== undefined) return cachedBootstrap;

  try {
    const skillContent = readFileSync(bootstrapSkillPath, 'utf8');
    const body = stripFrontmatter(skillContent);
    cachedBootstrap = `${EXTREMELY_IMPORTANT_MARKER}
${BOOTSTRAP_MARKER}

You have Ryugi.

The using-ryugi skill content is included below and is already loaded for this Pi session. Follow it now. Do not try to load using-ryugi again.

${body}

${piToolMapping()}
</EXTREMELY_IMPORTANT>`;
    return cachedBootstrap;
  } catch {
    cachedBootstrap = null;
    return null;
  }
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return (match ? match[1] : content).trim();
}

function piToolMapping(): string {
  return `## Pi tool mapping

Pi has native skills but does not expose Claude Code's \`Skill\` tool. When a Ryugi instruction says to invoke a skill, use Pi's native skill system instead: load the relevant \`SKILL.md\` with \`read\` when the skill applies, or let a human invoke \`/skill:name\` explicitly.

Pi's built-in coding tools are lowercase: \`read\`, \`write\`, \`edit\`, \`bash\`, plus optional \`grep\`, \`find\`, and \`ls\`. Use those for the corresponding actions: read a file, create or edit files, run shell commands, search file contents, find files by name, and list directories.

Pi does not ship a standard subagent tool. If a subagent tool such as \`subagent\` from \`pi-subagents\` is available, use it for Ryugi subagent workflows. If no subagent tool is available, do the work in this session or explain the missing capability instead of inventing \`Task\` calls.

Pi does not ship a standard task-list tool. If an installed todo/task tool is available, use it. Otherwise track work in plan files or a repo-local \`TODO.md\` when task tracking is needed. Treat older \`TodoWrite\` references as this task-tracking action.`;
}

function messageContainsBootstrap(message: unknown): boolean {
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content.includes(BOOTSTRAP_MARKER);
  if (!Array.isArray(content)) return false;
  return content.some((part) => {
    return (
      part &&
      typeof part === 'object' &&
      (part as { type?: unknown }).type === 'text' &&
      typeof (part as { text?: unknown }).text === 'string' &&
      (part as { text: string }).text.includes(BOOTSTRAP_MARKER)
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
