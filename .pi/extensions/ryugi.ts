import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

import { projectRoot, subscriptions } from '../../skills/artifacts/app/comment-subscriptions.cjs';
import { createCommentWatch, wakeMessage } from '../../skills/artifacts/app/comment-watch.cjs';

const EXTREMELY_IMPORTANT_MARKER = '<EXTREMELY_IMPORTANT>';
const BOOTSTRAP_MARKER = 'ryugi:using-ryugi bootstrap for pi';

const extensionDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(extensionDir, '../..');
const skillsDir = resolve(packageRoot, 'skills');
const bootstrapSkillPath = resolve(skillsDir, 'using-ryugi', 'SKILL.md');

const COMMENT_POLL_MS = 1000;

let cachedBootstrap: string | null | undefined;

export default function ryugiPiExtension(pi: ExtensionAPI) {
  let injectBootstrap = true;
  let commentTimer: ReturnType<typeof setInterval> | undefined;

  const stopCommentWatch = () => {
    clearInterval(commentTimer);
    commentTimer = undefined;
  };

  pi.on('session_start', async (_event, ctx) => {
    injectBootstrap = true;
    stopCommentWatch();
    commentTimer = watchComments(pi, ctx, projectRoot(ctx.cwd), ctx.sessionManager.getSessionId());
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

// Wakes this session for human comments and choice rounds on the artifacts it opened through the
// launcher. A busy session gets them as a follow-up after its current turn instead of a steer.
function watchComments(pi: ExtensionAPI, ctx: ExtensionContext, project: string, session: string) {
  const poll = createCommentWatch(project, 'pi');
  // An error thrown from a timer is an uncaughtException, which exits Pi. Report each distinct
  // failure once instead, because the same one usually repeats on every poll.
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
  const deliver = (event: { type: string }) => {
    try {
      // Typed as void, but a host may hand back a promise; its rejection must not escape either.
      Promise.resolve(
        pi.sendMessage(
          { customType: event.type, content: wakeMessage(event), display: true },
          { triggerTurn: true, deliverAs: 'followUp' },
        ),
      ).catch(report);
    } catch (error) {
      report(error);
    }
  };
  const timer = setInterval(() => {
    try {
      const artifacts = subscriptions(project, 'pi', session);
      if (artifacts.size) for (const event of poll(artifacts)) deliver(event);
    } catch (error) {
      report(error);
    }
  }, COMMENT_POLL_MS);
  timer.unref();
  return timer;
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
