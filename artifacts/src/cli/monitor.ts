import type { CommandSpec } from './command';
import { duration, shortPath, tags } from './monitor-view';
import { runMonitorUi } from './monitor-ui';
import { listServers, type ServerRow } from './servers';
import type { Emit } from './start';

export function monitorText(value: Record<string, unknown>, now = Date.now()): string | null {
  if (value.type !== 'servers') return null;
  const rows = value.servers as ServerRow[];
  if (!rows.length) return 'No artifacts servers are running.';
  return rows.map((row) => [
    shortPath(row.project),
    row.url ?? 'starting',
    `pid ${row.pid}`,
    row.clients === null ? null : `tabs ${row.clients}`,
    row.lastActivity === null ? null : `idle ${duration(now - row.lastActivity)}`,
    ...tags(row).map((tag) => `[${tag}]`),
  ].filter(Boolean).join('  ')).join('\n');
}

export async function monitor(options: { json: boolean }, emit: Emit): Promise<number> {
  if (options.json || !process.stdout.isTTY || !process.stdin.isTTY) {
    emit({ type: 'servers', servers: await listServers() });
    return 0;
  }
  return runMonitorUi();
}

export const monitorCommand: CommandSpec = {
  name: 'monitor',
  summary: 'List every running artifacts server on this machine and manage them',
  details: 'In a terminal it opens a live view (open, copy URL, logs, stop); otherwise, or with --json, prints the list once.',
  options: {},
  run: ({ values }, emit) => monitor({ json: !!values.json }, emit),
  text: (value) => monitorText(value),
};
