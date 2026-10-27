import { expect, test } from 'vitest';
import {
  handleKey,
  initialView,
  renderList,
  renderLog,
  type ViewState,
} from '../src/cli/monitor-view';
import type { ServerRow } from '../src/cli/servers';

const plain = (lines: string[]) => lines.map((line) => line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''));

const row = (project: string, extra: Partial<ServerRow> = {}): ServerRow => ({
  project,
  root: `${project}/.ryugi/artifacts`,
  pid: 4100,
  url: 'http://localhost:53121/?key=k',
  port: 53121,
  startedAt: 0,
  version: '1.32.0',
  oldRelease: false,
  clients: 1,
  lastActivity: 0,
  safeToStop: false,
  status: 'ok',
  log: `${project}/.ryugi/artifacts/.state/server.log`,
  ...extra,
});

const rows = [
  row('/w/one'),
  row('/w/two', { clients: 0, safeToStop: true }),
  row('/w/three', { oldRelease: true }),
];
const key = (name: string, extra: { shift?: boolean; ctrl?: boolean; sequence?: string } = {}) => ({
  name,
  sequence: extra.sequence ?? name,
  ...extra,
});

const press = (state: ViewState, ...names: Parameters<typeof key>[]) => {
  let current = state;
  let action;
  for (const args of names) ({ state: current, action } = handleKey(current, key(...args), rows));
  return { state: current, action };
};

test('the list shows one line per server with its columns, tags and the selection', () => {
  const lines = plain(
    renderList(rows, initialView(), { width: 120, height: 20, now: 2 * 3600_000, home: '/h' }),
  );
  expect(lines[0]).toMatch(/^ryugi-artifacts monitor\s+3 servers · refreshes every 2s$/);
  expect(lines[1]).toMatch(/PROJECT\s+PORT\s+PID\s+UP\s+TABS\s+IDLE\s+VERSION/);
  expect(lines[2]).toMatch(/^› \/w\/one\s+53121\s+4100\s+2h\s+1\s+2h\s+1\.32\.0/);
  expect(lines[3]).toMatch(/^ {2}\/w\/two .*safe to stop/);
  expect(lines[4]).toMatch(/old release/);
  expect(lines.at(-1)).toMatch(
    /o open {2}c copy URL {2}l logs {2}x stop {2}X stop all safe {2}q quit/,
  );
  expect(lines.every((line) => line.length <= 120)).toBe(true);
});

test('long project paths are cut from the left to fit the width', () => {
  const lines = plain(
    renderList([row(`/w/${'deep/'.repeat(20)}leaf`)], initialView(), {
      width: 80,
      height: 10,
      now: 0,
      home: '/h',
    }),
  );
  expect(lines[2]).toMatch(/^› ….*leaf /);
  expect(lines.every((line) => line.length <= 80)).toBe(true);
});

test('an empty registry says so', () => {
  expect(
    plain(renderList([], initialView(), { width: 80, height: 10, now: 0, home: '/h' })).join('\n'),
  ).toMatch(/No artifacts servers are running\./);
});

test('arrows and j/k move the selection within the list', () => {
  expect(press(initialView(), ['down'], ['j'], ['down']).state.selected).toBe(2);
  expect(press(initialView(), ['up'], ['k']).state.selected).toBe(0);
});

test('open, copy and logs act on the selected server', () => {
  expect(press(initialView(), ['down'], ['o']).action).toEqual({ type: 'open', row: rows[1] });
  expect(press(initialView(), ['c']).action).toEqual({ type: 'copy', row: rows[0] });
  expect(press(initialView(), ['l']).state.mode).toBe('log');
});

test('stopping one server needs a y to confirm, and any other key cancels', () => {
  const asked = press(initialView(), ['x']);
  expect(asked.action).toBeUndefined();
  expect(asked.state.confirm).toBe('stop');
  expect(
    plain(renderList(rows, asked.state, { width: 120, height: 10, now: 0, home: '/h' })).at(-1),
  ).toMatch(/Stop \/w\/one\? y to confirm/);
  expect(press(asked.state, ['y']).action).toEqual({ type: 'stop', rows: [rows[0]] });
  const cancelled = press(asked.state, ['n']);
  expect(cancelled.action).toBeUndefined();
  expect(cancelled.state.confirm).toBeNull();
});

test('X stops every server that is safe to stop after confirming', () => {
  const asked = press(initialView(), ['x', { shift: true, sequence: 'X' }]);
  expect(asked.state.confirm).toBe('stop-safe');
  expect(press(asked.state, ['y']).action).toEqual({ type: 'stop', rows: [rows[1]] });
});

test('X with nothing safe to stop explains instead of asking', () => {
  const { state } = handleKey(initialView(), key('x', { shift: true, sequence: 'X' }), [rows[0]!]);
  expect(state.confirm).toBeNull();
  expect(state.message).toMatch(/Nothing is safe to stop/);
});

test('q and Ctrl+C quit from the list; Esc and q leave the log view', () => {
  expect(press(initialView(), ['q']).action).toEqual({ type: 'quit' });
  expect(press(initialView(), ['c', { ctrl: true }]).action).toEqual({ type: 'quit' });
  expect(press(initialView(), ['l'], ['escape']).state.mode).toBe('list');
  expect(press(initialView(), ['l'], ['q']).state.mode).toBe('list');
  expect(press(initialView(), ['l'], ['c', { ctrl: true }]).action).toEqual({ type: 'quit' });
});

test('the log view shows the newest lines that fit, or why there is no log', () => {
  const text = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
  const lines = plain(renderLog(rows[0]!, text, { width: 80, height: 10, now: 0, home: '/h' }));
  expect(lines[0]).toMatch(/Log · \/w\/one/);
  expect(lines).toContain('line 49');
  expect(lines).not.toContain('line 40');
  expect(lines.length).toBeLessThanOrEqual(10);
  expect(
    plain(renderLog(rows[0]!, null, { width: 80, height: 10, now: 0, home: '/h' })).join('\n'),
  ).toMatch(/runs in the foreground/);
});

test('a pending stop stays on the server it asked about even if the list changes', () => {
  const asked = handleKey(initialView(), key('x'), rows).state;
  const shifted = rows.slice(1);
  expect(
    plain(renderList(shifted, asked, { width: 120, height: 10, now: 0, home: '/h' })).at(-1),
  ).toMatch(/Stop \/w\/one\?/);
  const confirmed = handleKey(asked, key('y'), shifted);
  expect(confirmed.action).toBeUndefined();
  expect(confirmed.state.message).toMatch(/\/w\/one is no longer running/);
});
