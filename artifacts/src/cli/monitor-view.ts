import os from 'node:os';
import type { ServerRow } from './servers';

export interface ViewState {
  mode: 'list' | 'log';
  selected: number;
  confirm: 'stop' | 'stop-safe' | null;
  target: string | null;
  message: string | null;
}

export type Action =
  | { type: 'quit' }
  | { type: 'open' | 'copy'; row: ServerRow }
  | { type: 'stop'; rows: ServerRow[] };

export interface Key {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  shift?: boolean;
}

export interface Screen {
  width: number;
  height: number;
  now: number;
  home: string;
}

export const REFRESH_SECONDS = 2;

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const INVERSE = '\x1b[7m';
const RESET = '\x1b[0m';

const HELP = '↑↓ select  o open  c copy URL  l logs  x stop  X stop all safe  q quit';
const COLUMNS = [
  ['PORT', 6],
  ['PID', 8],
  ['UP', 7],
  ['TABS', 5],
  ['IDLE', 7],
  ['VERSION', 13],
] as const;
const FIXED = 2 + COLUMNS.reduce((sum, [, width]) => sum + width + 2, 0);
const TAGS_WIDTH = 26;

export function duration(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${minutes % 60 ? `${minutes % 60}m` : ''}`;
  return `${Math.floor(hours / 24)}d${hours % 24 ? `${hours % 24}h` : ''}`;
}

export const shortPath = (project: string, home = os.homedir()) =>
  project === home || project.startsWith(`${home}/`) ? `~${project.slice(home.length)}` : project;

export function tags(row: ServerRow) {
  return [
    row.safeToStop && 'safe to stop',
    row.oldRelease && 'old release',
    row.status === 'no-status' && 'no status',
  ].filter(Boolean) as string[];
}

export const initialView = (): ViewState => ({
  mode: 'list',
  selected: 0,
  confirm: null,
  target: null,
  message: null,
});

const fit = (text: string, width: number) => (text.length > width ? text.slice(0, width) : text);
const pad = (text: string, width: number) => fit(text, width).padEnd(width);
const cutLeft = (text: string, width: number) =>
  text.length > width ? `…${text.slice(text.length - width + 1)}` : text;

function header(left: string, right: string, width: number) {
  const gap = width - left.length - right.length;
  return `${BOLD}${fit(gap >= 2 ? `${left}${' '.repeat(gap)}${right}` : left, width)}${RESET}`;
}

function cells(row: ServerRow, now: number) {
  return [
    row.port === null ? '-' : String(row.port),
    String(row.pid),
    duration(now - row.startedAt),
    row.clients === null ? '-' : String(row.clients),
    row.lastActivity === null ? '-' : duration(now - row.lastActivity),
    row.version ?? '-',
  ];
}

function footer(rows: ServerRow[], state: ViewState, home: string) {
  if (state.confirm === 'stop' && state.target)
    return `Stop ${shortPath(state.target, home)}? y to confirm`;
  if (state.confirm === 'stop-safe') {
    const count = rows.filter((row) => row.safeToStop).length;
    return `Stop ${count} server${count === 1 ? '' : 's'} that ${count === 1 ? 'is' : 'are'} safe to stop? y to confirm`;
  }
  return state.message ?? HELP;
}

export function renderList(rows: ServerRow[], state: ViewState, screen: Screen): string[] {
  const { width, height, now, home } = screen;
  const count = `${rows.length} server${rows.length === 1 ? '' : 's'} · refreshes every ${REFRESH_SECONDS}s`;
  const lines = [header('ryugi-artifacts monitor', count, width)];
  if (!rows.length) {
    lines.push('', fit('No artifacts servers are running.', width), '');
  } else {
    const projectWidth = Math.max(12, width - FIXED - TAGS_WIDTH);
    const columns = [
      '  ',
      pad('PROJECT', projectWidth),
      ...COLUMNS.map(([name, w]) => `  ${pad(name, w)}`),
    ].join('');
    lines.push(`${DIM}${fit(columns.trimEnd(), width)}${RESET}`);
    const visible = Math.max(1, height - 4);
    const first = Math.min(
      Math.max(0, state.selected - visible + 1),
      Math.max(0, rows.length - visible),
    );
    rows.slice(first, first + visible).forEach((row, offset) => {
      const selected = first + offset === state.selected;
      const text = [
        selected ? '› ' : '  ',
        pad(cutLeft(shortPath(row.project, home), projectWidth), projectWidth),
        ...cells(row, now).map((cell, i) => `  ${pad(cell, COLUMNS[i]![1])}`),
        tags(row).length ? `  ${tags(row).join(', ')}` : '',
      ].join('');
      const line = fit(text.trimEnd(), width);
      lines.push(selected ? `${INVERSE}${line}${RESET}` : line);
    });
    lines.push('');
  }
  lines.push(`${DIM}${fit(footer(rows, state, home), width)}${RESET}`);
  return lines;
}

export function renderLog(row: ServerRow, text: string | null, screen: Screen): string[] {
  const { width, height, home } = screen;
  const lines = [header(`Log · ${shortPath(row.project, home)}`, row.log, width)];
  const body =
    text === null
      ? [
          'No log file: this server runs in the foreground, so its output is in the terminal that started it.',
        ]
      : text
          .replace(/\n+$/, '')
          .split('\n')
          .slice(-Math.max(1, height - 2));
  lines.push(...body.map((line) => fit(line, width)));
  lines.push(`${DIM}${fit('Esc back  Ctrl+C quit', width)}${RESET}`);
  return lines;
}

export function handleKey(
  state: ViewState,
  key: Key,
  rows: ServerRow[],
): { state: ViewState; action?: Action } {
  if (key.ctrl && key.name === 'c') return { state, action: { type: 'quit' } };
  const next: ViewState = { ...state, confirm: null, target: null, message: null };
  if (state.mode === 'log')
    return { state: key.name === 'escape' || key.name === 'q' ? { ...next, mode: 'list' } : state };
  if (state.confirm) {
    if (key.name !== 'y') return { state: next };
    const targets =
      state.confirm === 'stop'
        ? rows.filter((row) => row.project === state.target)
        : rows.filter((row) => row.safeToStop);
    if (targets.length) return { state: next, action: { type: 'stop', rows: targets } };
    return {
      state: {
        ...next,
        message: state.target
          ? `${shortPath(state.target)} is no longer running.`
          : 'Nothing is safe to stop any more.',
      },
    };
  }
  const selected = rows[state.selected];
  if (key.sequence === 'X' || (key.name === 'x' && key.shift)) {
    if (rows.some((row) => row.safeToStop)) return { state: { ...next, confirm: 'stop-safe' } };
    return {
      state: {
        ...next,
        message:
          'Nothing is safe to stop: every server has an open tab or was used in the last 30 minutes.',
      },
    };
  }
  switch (key.name) {
    case 'q':
      return { state, action: { type: 'quit' } };
    case 'up':
    case 'k':
      return { state: { ...next, selected: Math.max(0, state.selected - 1) } };
    case 'down':
    case 'j':
      return {
        state: { ...next, selected: Math.min(Math.max(0, rows.length - 1), state.selected + 1) },
      };
    case 'o':
    case 'c':
      if (!selected) return { state: next };
      if (!selected.url) return { state: { ...next, message: 'This server has no URL yet.' } };
      return { state: next, action: { type: key.name === 'o' ? 'open' : 'copy', row: selected } };
    case 'l':
      return { state: selected ? { ...next, mode: 'log' } : next };
    case 'x':
      return { state: selected ? { ...next, confirm: 'stop', target: selected.project } : next };
    default:
      return { state: next };
  }
}
