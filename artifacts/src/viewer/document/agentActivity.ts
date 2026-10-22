export type AgentActivity =
  | { kind: 'editing' }
  | { kind: 'idle' }
  | { kind: 'working'; pending: number; idleMs: number | null }
  | { kind: 'stale'; pending: number; idleMs: number };

export const STALE_MS = 5 * 60_000;

interface ActivityInput {
  streaming: boolean;
  pending: number;
  agentActiveAt: number | undefined;
  now: number;
}

export function agentActivity({ streaming, pending, agentActiveAt, now }: ActivityInput): AgentActivity {
  if (streaming) return { kind: 'editing' };
  if (pending === 0) return { kind: 'idle' };
  if (agentActiveAt === undefined) return { kind: 'working', pending, idleMs: null };
  const idleMs = Math.max(0, now - agentActiveAt);
  return idleMs > STALE_MS ? { kind: 'stale', pending, idleMs } : { kind: 'working', pending, idleMs };
}

function duration(ms: number) {
  if (ms < 60_000) return `${Math.floor(ms / 1000)} 秒`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分钟`;
  return `${Math.floor(ms / 3_600_000)} 小时`;
}

export function activityLabel(activity: AgentActivity, agent: string, section: string | null): string | null {
  switch (activity.kind) {
    case 'editing':
      return `${agent} 正在编辑${section ? ` ${section}` : ''}`;
    case 'idle':
      return null;
    case 'working': {
      const left = `${agent} 还有 ${activity.pending} 节待写`;
      if (activity.idleMs === null) return left;
      return `${left} · ${activity.idleMs < 10_000 ? '刚刚' : `${duration(activity.idleMs)}前`}更新`;
    }
    case 'stale':
      return `${agent} ${duration(activity.idleMs)}没有更新 · 还有 ${activity.pending} 节待写`;
  }
}
