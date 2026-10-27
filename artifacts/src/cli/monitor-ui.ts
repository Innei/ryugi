import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import readline from 'node:readline';
import { browserLauncher } from '../server/lifecycle';
import {
  handleKey,
  initialView,
  REFRESH_SECONDS,
  renderList,
  renderLog,
  shortPath,
  type Action,
  type Key,
  type ViewState,
} from './monitor-view';
import { listServers, type ServerRow } from './servers';
import { stop } from './stop';

const LOG_TAIL_BYTES = 64 * 1024;
const LOG_REFRESH_MS = 500;

function readTail(file: string): string | null {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    const size = fs.fstatSync(fd).size;
    const length = Math.min(size, LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, size - length);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function clipboardCommands(): [string, string[]][] {
  if (process.platform === 'darwin') return [['pbcopy', []]];
  if (process.platform === 'win32') return [['clip', []]];
  return [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
  ];
}

function copy(text: string, commands = clipboardCommands()): Promise<boolean> {
  const [first, ...rest] = commands;
  if (!first) return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn(first[0], first[1], { stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', () => resolve(copy(text, rest)));
    child.on('close', (code) => (code === 0 ? resolve(true) : resolve(copy(text, rest))));
    child.stdin.end(text);
  });
}

export async function runMonitorUi(): Promise<number> {
  const { stdin, stdout } = process;
  let rows: ServerRow[] = await listServers();
  let state: ViewState = initialView();
  let busy = false;
  let closed = false;

  const restore = () => {
    if (closed) return;
    closed = true;
    try {
      stdin.setRawMode(false);
    } catch {}
    stdout.write('\x1b[?25h\x1b[?1049l');
  };
  process.on('exit', restore);

  const draw = () => {
    if (closed) return;
    const screen = {
      width: stdout.columns || 80,
      height: stdout.rows || 24,
      now: Date.now(),
      home: os.homedir(),
    };
    const row = rows[state.selected];
    const lines =
      state.mode === 'log' && row
        ? renderLog(row, readTail(row.log), screen)
        : renderList(rows, state, screen);
    stdout.write(`\x1b[H${lines.join('\x1b[K\n')}\x1b[K\x1b[J`);
  };

  const refresh = async () => {
    if (busy || closed) return;
    busy = true;
    const selected = rows[state.selected]?.project;
    try {
      rows = await listServers();
    } finally {
      busy = false;
    }
    const index = rows.findIndex((row) => row.project === selected);
    state = {
      ...state,
      selected: index >= 0 ? index : Math.min(state.selected, Math.max(0, rows.length - 1)),
    };
    if (state.mode === 'log' && !rows[state.selected]) state = { ...state, mode: 'list' };
    draw();
  };

  const say = (message: string) => {
    state = { ...state, message };
    draw();
  };

  const run = async (action: Action) => {
    if (action.type === 'open') {
      const launcher = browserLauncher(process.platform, action.row.url!);
      if (launcher) execFile(launcher.bin, launcher.args, () => {});
      say(launcher ? `Opened ${action.row.url}` : `Open ${action.row.url}`);
      return;
    }
    if (action.type === 'copy') {
      say(
        (await copy(action.row.url!))
          ? `Copied ${action.row.url}`
          : `No clipboard tool found; the URL is ${action.row.url}`,
      );
      return;
    }
    if (action.type === 'stop') {
      say(
        `Stopping ${action.rows.length === 1 ? shortPath(action.rows[0]!.project) : `${action.rows.length} servers`}…`,
      );
      const failed: string[] = [];
      for (const row of action.rows) {
        let status = 'failed';
        try {
          await stop(row.project, (value) => {
            status = String(value.status ?? 'failed');
          });
        } catch {}
        if (status === 'failed') failed.push(shortPath(row.project));
      }
      await refresh();
      say(
        failed.length
          ? `Could not stop ${failed.join(', ')}`
          : `Stopped ${action.rows.length === 1 ? shortPath(action.rows[0]!.project) : `${action.rows.length} servers`}`,
      );
    }
  };

  return new Promise<number>((resolve) => {
    const timers = [
      setInterval(() => void refresh(), REFRESH_SECONDS * 1000),
      setInterval(() => {
        if (state.mode === 'log') draw();
      }, LOG_REFRESH_MS),
    ];
    const quit = (code: number) => {
      timers.forEach(clearInterval);
      stdin.off('keypress', onKey);
      stdout.off('resize', draw);
      stdin.pause();
      restore();
      resolve(code);
    };
    const onKey = (_: string, key: Key | undefined) => {
      const result = handleKey(state, key ?? {}, rows);
      state = result.state;
      if (result.action?.type === 'quit') return quit(0);
      draw();
      if (result.action) void run(result.action);
    };
    for (const [signal, code] of [
      ['SIGINT', 130],
      ['SIGTERM', 143],
      ['SIGHUP', 129],
    ] as const)
      process.once(signal, () => quit(code));
    stdout.write('\x1b[?1049h\x1b[?25l');
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('keypress', onKey);
    stdout.on('resize', draw);
    draw();
  });
}
