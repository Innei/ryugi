import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { commentText } from '../src/cli/comment';
import { AGENT_MARKERS } from '../src/server/agent';
import { listen } from '../src/server/http';
import { writeArtboard, writeDocument } from './helpers';

const cli = path.resolve(__dirname, '../../skills/artifacts/app/cli.cjs');
let projects: string[] = [];

afterEach(() => {
  for (const project of projects) spawnSync(process.execPath, [cli, 'stop', '--project-dir', project], { encoding: 'utf8', timeout: 15000 });
  projects = [];
});

function env(agent: Record<string, string>) {
  const clean: NodeJS.ProcessEnv = { ...process.env, ARTIFACTS_OPEN: '0' };
  for (const key of AGENT_MARKERS) delete clean[key];
  return { ...clean, ...agent };
}

function run(args: string[], { stdin, agent = { CODEX_THREAD_ID: 't1' }, json = true }: { stdin?: string; agent?: Record<string, string>; json?: boolean } = {}) {
  return new Promise<{ code: number | null; stdout: string; out: Record<string, any> }>((resolve) => {
    const child = spawn(process.execPath, [cli, ...args, ...(json ? ['--json'] : [])], { env: env(agent) });
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.on('close', (code) => {
      const last = stdout.trim().split('\n').pop() ?? '';
      let out: Record<string, any> = {};
      try {
        out = JSON.parse(last);
      } catch {}
      resolve({ code, stdout, out });
    });
    child.stdin.end(stdin ?? '');
  });
}

async function project({ running = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-project-'));
  projects.push(dir);
  writeDocument(path.join(dir, '.ryugi', 'artifacts'), 'relay', { 'doc.xml': '<doc><p id="b1">按事件粒度推送</p></doc>' });
  if (running) expect((await run(['start', '--project-dir', dir, '--background'])).out.type).toBe('server-started');
  return dir;
}

const comments = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, '.ryugi', 'artifacts', 'document', 'relay', 'comments.json'), 'utf8'));
async function humanReply(dir: string, threadId: string, text: string) {
  const url = new URL(JSON.parse(fs.readFileSync(path.join(dir, '.ryugi', 'artifacts', '.state', 'server-info'), 'utf8')).url);
  const key = url.searchParams.get('key');
  const res = await fetch(`${url.origin}/api/document/relay/comments?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: url.origin },
    body: JSON.stringify({ op: 'reply', threadId, text }),
  });
  expect(res.status).toBe(200);
}

const doc = (dir: string) => ['--project-dir', dir, '--artifact', 'document/relay'];

describe('ryugi-artifacts comment', () => {
  test('add reads the message from stdin and names it after the calling agent', async () => {
    const dir = await project();
    const { code, out } = await run(['comment', 'add', ...doc(dir), '--block', 'b1', '--quote', '事件'], { stdin: '第一行\n"第二行"\n' });
    expect(code).toBe(0);
    expect(out).toMatchObject({ type: 'comment-added', artifact: 'document/relay', threadId: expect.any(String), messageId: expect.any(String) });
    expect(comments(dir).threads[0]).toMatchObject({ anchor: { blockId: 'b1', quote: '事件' }, messages: [{ author: 'agent', name: 'Codex', text: '第一行\n"第二行"' }] });
  });

  test('reply, list and resolve work on threads by id', async () => {
    const dir = await project();
    const threadId = (await run(['comment', 'add', ...doc(dir), '--block', 'b1', '--text', 'q?'])).out.threadId;
    expect((await run(['comment', 'reply', ...doc(dir), '--thread', threadId, '--text', 'more'], { agent: { CLAUDECODE: '1' } })).out).toMatchObject({ type: 'comment-replied', threadId });
    expect(comments(dir).threads[0].messages[1]).toMatchObject({ author: 'agent', name: 'Claude Code', text: 'more' });
    expect((await run(['comment', 'list', ...doc(dir)])).out).toEqual({ type: 'comments', artifact: 'document/relay', threads: [] });
    const all = (await run(['comment', 'list', ...doc(dir), '--all'])).out;
    expect(all.threads).toHaveLength(1);
    expect(all.threads[0]).toMatchObject({ id: threadId, waitingOn: 'human' });
    expect((await run(['comment', 'resolve', ...doc(dir), '--thread', threadId])).out).toMatchObject({ type: 'comment-resolved', threadId });
    expect(comments(dir).threads[0]).toMatchObject({ status: 'resolved', statusBy: 'agent' });
  });

  test('list after a human reply shows it as a new message', async () => {
    const dir = await project();
    const threadId = (await run(['comment', 'add', ...doc(dir), '--block', 'b1', '--quote', '事件', '--text', 'q?'])).out.threadId;
    await humanReply(dir, threadId, '人的回复');
    const [thread] = (await run(['comment', 'list', ...doc(dir)])).out.threads;
    expect(thread).toMatchObject({ id: threadId, changes: ['new-message'], waitingOn: 'agent' });
    expect(thread.messages.at(-1)).toMatchObject({ author: 'human', text: '人的回复' });
  });

  test('rejects a missing message, a non-document artifact and an unknown action', async () => {
    const dir = await project({ running: false });
    expect((await run(['comment', 'add', ...doc(dir), '--block', 'b1'], { stdin: '  ' })).out.error).toMatch(/text/i);
    expect((await run(['comment', 'list', '--project-dir', dir, '--artifact', 'html/x'])).out.error).toContain('document/<id>');
    expect((await run(['comment', 'erase', ...doc(dir)])).out.error).toContain('list, add, reply or resolve');
    expect((await run(['comment', 'reply', ...doc(dir), '--text', 'x'])).out.error).toContain('--thread');
  });

  test('asks for the server to be started when none is running', async () => {
    const dir = await project({ running: false });
    const { code, out } = await run(['comment', 'list', ...doc(dir)]);
    expect(code).toBe(1);
    expect(out.error).toContain('ryugi-artifacts start');
  });

  test('tells the agent to restart an older server that has no comment route', async () => {
    const dir = await project({ running: false });
    const old = http.createServer((_req, res) => res.writeHead(404).end('Not found'));
    const port = await listen(old, '127.0.0.1', 0);
    const state = path.join(dir, '.ryugi', 'artifacts', '.state');
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(state, 'server-info'), JSON.stringify({ url: `http://127.0.0.1:${port}/?key=k` }));
    const { code, out } = await run(['comment', 'list', ...doc(dir)]);
    old.close();
    expect(code).toBe(1);
    expect(out.error).toContain('older than this CLI');
    expect(out.error).toContain('start --project-dir');
  });

  test('reports server errors such as an unknown block', async () => {
    const dir = await project();
    const { code, out } = await run(['comment', 'add', ...doc(dir), '--block', 'nope', '--text', 'x']);
    expect(code).toBe(1);
    expect(out.error).toContain('no block nope');
  });
});

describe('comment text output', () => {
  test('says when there is nothing new, or nothing at all', () => {
    expect(commentText({ type: 'comments', artifact: 'document/relay', threads: [] })).toBe('No new comments on document/relay.');
    expect(commentText({ type: 'comments', artifact: 'document/relay', threads: [], all: true })).toBe('No comments on document/relay.');
  });

  test('shows each thread with its id, state, quote and messages', () => {
    const text = commentText({
      type: 'comments',
      artifact: 'document/relay',
      threads: [
        {
          id: 't1',
          status: 'open',
          anchor: { blockId: 'b1', quote: '事件' },
          waitingOn: 'agent',
          changes: ['new-message'],
          messages: [
            { author: 'agent', name: 'Codex', text: 'q?' },
            { author: 'human', name: 'innei', text: '第一行\n第二行' },
            { author: 'human', text: '', deleted: true },
          ],
        },
      ],
    });
    expect(text).toBe(
      ['thread t1 (open · waiting on agent · new-message)', '  on block b1 "事件"', '  agent (Codex): q?', '  human (innei): 第一行\n    第二行', '  human: [deleted]'].join('\n'),
    );
  });
});

describe('artboard comments', () => {
  const board = (dir: string) => ['--project-dir', dir, '--artifact', 'artboard/review'];
  async function artboardProject(extra: Record<string, unknown> = {}) {
    const dir = await project({ running: false });
    writeArtboard(path.join(dir, '.ryugi', 'artifacts'), 'review', {
      version: 1,
      pages: [{ id: 'p', name: 'P' }],
      boards: { a: { file: 'pages/a.html', page: 'p', x: 0, y: 0, w: 640, h: 400 } },
      ...extra,
    }, { 'pages/a.html': '<html><body><p>a</p></body></html>' });
    expect((await run(['start', '--project-dir', dir, '--background'])).out.type).toBe('server-started');
    return dir;
  }

  test('add puts a thread on a board, at its top-right corner unless told where', async () => {
    const dir = await artboardProject();
    const added = await run(['comment', 'add', ...board(dir), '--board', 'a', '--text', '这里不确定']);
    expect(added.out).toMatchObject({ type: 'comment-added', artifact: 'artboard/review', threadId: expect.any(String) });
    await run(['comment', 'add', ...board(dir), '--board', 'a', '--x', '12', '--y', '30', '--text', '还有这里']);
    const all = (await run(['comment', 'list', ...board(dir), '--all'])).out;
    expect(all.threads.map((t: { anchor: unknown }) => t.anchor)).toEqual([
      expect.objectContaining({ page: 'p', board: 'a', x: 640, y: 0 }),
      expect.objectContaining({ page: 'p', board: 'a', x: 12, y: 30 }),
    ]);
    expect(all.threads[0]).toMatchObject({ stale: false, files: { a: 'pages/a.html' } });
  });

  test('list passes each verify group and its verdict through', async () => {
    const dir = await artboardProject({ groups: { g: { title: '验收', boards: ['a'], verify: true } } });
    const listed = (await run(['comment', 'list', ...board(dir)])).out;
    expect(listed.groups).toEqual([{ id: 'g', page: 'p', title: '验收', verdict: 'pending', evidenceUpdated: false, rejectThreads: 0, boards: ['a'] }]);
  });

  test('text output lists the verify groups after the threads', () => {
    const group = { page: 'p', evidenceUpdated: false, rejectThreads: 0, boards: ['a'] };
    expect(commentText({
      type: 'comments',
      artifact: 'artboard/r',
      threads: [],
      groups: [
        { ...group, id: 'notify', title: '通知设置', verdict: 'pass' },
        { ...group, id: 'digest', verdict: 'reject', rejectThreads: 1 },
        { ...group, id: 'onboard', verdict: 'pending', evidenceUpdated: true, rejectThreads: 2 },
      ],
    })).toBe([
      'No new comments on artboard/r.',
      '',
      'Verify groups:',
      '  notify (通知设置): passed',
      '  digest: rejected · 1 open reject thread',
      '  onboard: waiting for a verdict · evidence replaced since the last verdict · 2 open reject threads',
    ].join('\n'));
  });

  test('add on an artboard needs --board, and the board must exist', async () => {
    const dir = await artboardProject();
    expect((await run(['comment', 'add', ...board(dir), '--text', 'x'])).out.error).toContain('--board');
    expect((await run(['comment', 'add', ...board(dir), '--board', 'zz', '--text', 'x'])).out.error).toContain('no board zz');
  });

  test('text output names the page, board file, nodes, offset and staleness', () => {
    const text = commentText({
      type: 'comments',
      artifact: 'artboard/review',
      threads: [
        {
          id: 't1',
          status: 'open',
          anchor: { page: 'p', board: 'a', x: 510, y: 172, nodes: [{ board: 'a', path: 'body > img' }], offset: { x: 0.91, y: 0.45 } },
          stale: true,
          files: { a: 'pages/a.html' },
          waitingOn: 'agent',
          messages: [{ author: 'human', name: 'innei', text: '开关没对齐' }],
        },
        { id: 't2', status: 'open', anchor: { page: 'p', x: -40, y: 1200 }, stale: false, files: {}, waitingOn: null, messages: [{ author: 'agent', text: '整体' }] },
      ],
    });
    expect(text).toBe(
      [
        'thread t1 (open · waiting on agent · stale)',
        '  on page p, board a (pages/a.html) at 510,172',
        '  node a: body > img at 91%, 45%',
        '  the board changed since this comment; the node may have moved',
        '  human (innei): 开关没对齐',
        '',
        'thread t2 (open)',
        '  on page p at -40,1200',
        '  agent: 整体',
      ].join('\n'),
    );
  });
});
