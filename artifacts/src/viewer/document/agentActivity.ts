import { i18n } from '../i18n';

export type AgentActivity =
  | { kind: 'editing' }
  | { kind: 'idle' }
  | { kind: 'working'; pending: number; idleMs: number | null }
  | { kind: 'stale'; pending: number; idleMs: number };

export const STALE_MS = 5 * 60_000;

interface ActivityInput {
  agentActiveAt: number | undefined;
  now: number;
  pending: number;
  streaming: boolean;
}

export function agentActivity({
  streaming,
  pending,
  agentActiveAt,
  now,
}: ActivityInput): AgentActivity {
  if (streaming) return { kind: 'editing' };
  if (pending === 0) return { kind: 'idle' };
  if (agentActiveAt === undefined) return { kind: 'working', pending, idleMs: null };
  const idleMs = Math.max(0, now - agentActiveAt);
  return idleMs > STALE_MS
    ? { kind: 'stale', pending, idleMs }
    : { kind: 'working', pending, idleMs };
}

function duration(ms: number) {
  if (ms < 60_000) return i18n.t('time.seconds', { count: Math.floor(ms / 1000) });
  if (ms < 3_600_000) return i18n.t('time.minutes', { count: Math.floor(ms / 60_000) });
  return i18n.t('time.hours', { count: Math.floor(ms / 3_600_000) });
}

export function activityLabel(
  activity: AgentActivity,
  agent: string,
  section: string | null,
): string | null {
  switch (activity.kind) {
    case 'editing': {
      return section
        ? i18n.t('activity.editingSection', { agent, section })
        : i18n.t('activity.editing', { agent });
    }
    case 'idle': {
      return null;
    }
    case 'working': {
      const left = i18n.t('activity.pending', { agent, count: activity.pending });
      if (activity.idleMs === null) return left;
      return activity.idleMs < 10_000
        ? i18n.t('activity.updatedJustNow', { left })
        : i18n.t('activity.updatedAgo', { left, duration: duration(activity.idleMs) });
    }
    case 'stale': {
      return i18n.t('activity.stale', {
        agent,
        duration: duration(activity.idleMs),
        count: activity.pending,
      });
    }
  }
}
