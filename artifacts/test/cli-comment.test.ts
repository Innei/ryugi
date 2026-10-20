import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { commentText } from '../src/cli/comment';
import { AGENT_MARKERS } from '../src/server/agent';
import { listen } from '../src/server/http';
import { writeDocument } from './helpers';

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
