import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BUDGET_MS = Number(process.env.BENCH_BUDGET_MS ?? 18.2);
const SETTLE_MS = Number(process.env.BENCH_SETTLE_MS ?? 6000);
const RUNS = Number(process.env.BENCH_RUNS ?? 3);
const SERVER = path.resolve(here, '../../dist/server.cjs');
const CHROME =
  process.env.CHROME_PATH ??
  {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  }[process.platform] ??
  'google-chrome';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(read, timeoutMs, what) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}

async function connect(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let seq = 0;
  const waiting = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    waiting.get(message.id)?.(message);
    waiting.delete(message.id);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      waiting.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result
      ?.result?.value;
  return { send, evaluate, close: () => ws.close() };
}

function stats(frames) {
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const total = frames.reduce((sum, frame) => sum + frame, 0);
  return {
    frames: frames.length,
    avgFps: Math.round((frames.length * 1000) / total),
    p95ms: +p95.toFixed(1),
    worstMs: Math.round(sorted.at(-1)),
    over33: frames.filter((frame) => frame > 33).length,
  };
}

async function measure(devtools, name, url, frameMatch) {
  const targets = async () => (await fetch(`${devtools}/json/list`)).json();
  const page = await connect((await targets()).find((t) => t.type === 'page').webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Page.navigate', { url });
  await sleep(SETTLE_MS);
  const probe = frameMatch
    ? await connect(
        (
          await until(
            async () =>
              (await targets()).find((t) => t.type === 'iframe' && t.url.includes(frameMatch)),
            10_000,
            `a frame target matching ${frameMatch} among ${JSON.stringify((await targets()).map((t) => `${t.type} ${t.url}`))}`,
          )
        ).webSocketDebuggerUrl,
      )
    : page;
  await probe.evaluate(`(() => {
    window.__frames = null;
    let last = performance.now();
    const tick = (now) => {
      if (window.__frames) window.__frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  const { width, height } = await page.evaluate('({ width: innerWidth, height: innerHeight })');
  const x = Math.round(width / 2);
  const y = Math.round(height / 2);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await probe.evaluate('window.__frames = []');
  for (let cycle = 0; cycle < 4; cycle++)
    for (const direction of [-1, 1])
      for (let i = 0; i < 60; i++) {
        void page.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x,
          y,
          deltaX: 0,
          deltaY: direction * 1.5,
          modifiers: 2,
        });
        await sleep(8);
      }
  const frames = await probe.evaluate(
    '(() => { const f = window.__frames; window.__frames = null; return f; })()',
  );
  if (probe !== page) probe.close();
  page.close();
  return stats(frames.slice(1));
}

async function scenario(devtools, name, url, frameMatch) {
  const runs = [];
  for (let run = 0; run < RUNS; run++) runs.push(await measure(devtools, name, url, frameMatch));
  const median = runs.toSorted((a, b) => a.p95ms - b.p95ms)[Math.floor(RUNS / 2)];
  return {
    scenario: name,
    ...median,
    p95msRuns: runs.map((run) => run.p95ms),
    pass: median.p95ms <= BUDGET_MS,
  };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-zoom-'));
const root = path.join(tmp, '.ryugi', 'artifacts');
fs.cpSync(path.join(here, 'fixture'), path.join(root, 'artboard', 'zoom-bench'), {
  recursive: true,
});

const shellPage = fs.readFileSync(path.join(here, 'shell.html'));
const shell = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(shellPage);
});
await new Promise((resolve) => shell.listen(0, '127.0.0.1', resolve));
const shellOrigin = `http://127.0.0.1:${shell.address().port}`;

const env = { ...process.env, HOME: tmp, ARTIFACTS_ROOT: root, ARTIFACTS_OPEN: '0' };
delete env.XDG_CONFIG_HOME;
env.RYUGI_CLOUD_ORIGIN = shellOrigin;
const server = spawn(process.execPath, [SERVER], { env, stdio: ['ignore', 'pipe', 'inherit'] });
const profile = path.join(tmp, 'chrome');
const chrome = spawn(
  CHROME,
  [
    `--user-data-dir=${profile}`,
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,960',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function bench() {
  const started = await new Promise((resolve, reject) => {
    const lines = readline.createInterface({ input: server.stdout });
    lines.on('line', (line) => {
      const message = JSON.parse(line);
      if (message.type === 'server-started') resolve(message);
      if (message.type === 'server-error') reject(new Error(message.error));
    });
    server.once('exit', (code) => reject(new Error(`server exited with ${code}`)));
  });
  const devtoolsPort = await until(
    () => {
      try {
        return fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      } catch {
        return null;
      }
    },
    20_000,
    'Chrome to open its DevTools port',
  );
  const devtools = `http://127.0.0.1:${devtoolsPort}`;
  const local = `http://localhost:${started.port}`;
  return [
    await scenario(devtools, 'local', `${local}/artboard/zoom-bench`),
    await scenario(
      devtools,
      'embedded',
      `${shellOrigin}/?inner=${encodeURIComponent(`${local}/embed/artboard/zoom-bench`)}`,
      '/embed/artboard/',
    ),
  ];
}

const results = await bench().finally(async () => {
  chrome.kill();
  server.kill();
  shell.close();
  await sleep(500);
  fs.rmSync(tmp, { recursive: true, force: true });
});
for (const result of results) console.info(JSON.stringify(result));
const failed = results.some((result) => !result.pass);
if (failed) console.error(`zoom P95 is over the ${BUDGET_MS} ms budget`);
process.exit(failed ? 1 : 0);
