import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEFAULT_CLI = path.resolve(import.meta.dirname, '../../../skills/artifacts/app/ryugi-artifacts.cjs');
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseArgs(argv) {
  const [dir, ...rest] = argv;
  if (!dir) throw new Error('usage: <artboard dir> [--cli <ryugi-artifacts.cjs>] [--cold] [--rounds <n>]');
  const flag = (name) => rest.includes(name);
  const value = (name, fallback) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : fallback);
  const artboard = path.resolve(dir);
  const marker = `${path.sep}.ryugi${path.sep}artifacts${path.sep}artboard${path.sep}`;
  const at = artboard.lastIndexOf(marker);
  if (at < 0) throw new Error(`${dir} is not inside <project>/.ryugi/artifacts/artboard/`);
  return {
    project: artboard.slice(0, at),
    artifact: `artboard/${artboard.slice(at + marker.length)}`,
    cli: path.resolve(value('--cli', DEFAULT_CLI)),
    cold: flag('--cold'),
    rounds: Number(value('--rounds', 1)),
  };
}

// A private config dir keeps the server signed out, so it never relays to Ryugi Cloud.
export function startServer({ project, artifact, cli }) {
  const env = { ...process.env, XDG_CONFIG_HOME: mkdtempSync(path.join(tmpdir(), 'ryugi-perf-config-')), RYUGI_CLOUD_ORIGIN: 'http://127.0.0.1:9' };
  const run = (...args) => JSON.parse(execFileSync('node', [cli, ...args, '--json', '--project-dir', project], { env, encoding: 'utf8' }).trim().split('\n').pop());
  const started = run('start', '--no-open', '--artifact', artifact);
  return { link: started.link, list: started.url, stop: () => run('stop') };
}

const PROBES = String.raw`(() => {
  if (window.top !== window) return;
  const loadedAt = new WeakMap();
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      const frames = node.tagName === 'IFRAME' ? [node] : node.querySelectorAll ? [...node.querySelectorAll('iframe')] : [];
      for (const frame of frames) frame.addEventListener('load', () => loadedAt.set(frame, performance.now()));
    }
  }).observe(document, { childList: true, subtree: true });
  const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const viewport = () => document.querySelector('[data-board]')?.parentElement?.parentElement;
  const world = () => document.querySelector('[data-board]')?.parentElement;
  const view = () => {
    const match = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(world()?.style.transform ?? '');
    return match ? { x: +match[1], y: +match[2], k: +match[3] } : null;
  };
  const slots = () => [...document.querySelectorAll('[data-board]')].map((slot) => ({
    id: slot.dataset.board, slot, x: parseFloat(slot.style.left), y: parseFloat(slot.style.top), w: parseFloat(slot.style.width), h: parseFloat(slot.style.height),
  }));
  const drawn = (slot, now) => {
    for (const child of slot.children) {
      if (child.style.visibility === 'hidden') continue;
      if (child.tagName === 'IMG' && child.complete && child.naturalWidth > 0) return true;
      if (child.tagName === 'IFRAME' && now - (loadedAt.get(child) ?? Infinity) > 34) return true;
      if (child.tagName !== 'IMG' && child.tagName !== 'IFRAME' && child.querySelector('video, img')) return true;
    }
    return false;
  };
  const wheel = (deltaX, deltaY, zoom, x, y) => {
    const el = viewport();
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(new WheelEvent('wheel', { deltaX, deltaY, ctrlKey: zoom, clientX: rect.left + (x ?? rect.width / 2), clientY: rect.top + (y ?? rect.height / 2), bubbles: true, cancelable: true }));
  };
  const size = () => { const el = viewport(); return { width: el.clientWidth, height: el.clientHeight }; };
  const zoomTo = async (k, frames) => {
    for (let left = frames; left > 0; left--) {
      await raf();
      wheel(0, -Math.log(k / view().k) / 0.01 / left, true);
    }
  };
  const centerOn = async (wx, wy, frames) => {
    for (let left = frames; left > 0; left--) {
      await raf();
      const v = view(), { width, height } = size();
      wheel((v.x + wx * v.k - width / 2) / left, (v.y + wy * v.k - height / 2) / left, false);
    }
  };
  const focus = async (id, k, ms) => {
    const board = slots().find((entry) => entry.id === id);
    const frames = Math.max(2, Math.round(ms / 16.7));
    await centerOn(board.x + board.w / 2, board.y + board.h / 2, Math.ceil(frames / 2));
    await zoomTo(k, Math.floor(frames / 2));
  };
  const fit = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '!', code: 'Digit1', shiftKey: true, bubbles: true }));
  const record = () => {
    const deltas = [];
    let blank = 0, area = 0, blankFrames = 0, running = true, last = performance.now();
    const tick = (now) => {
      deltas.push(now - last); last = now;
      const v = view(), { width, height } = size();
      let frameBlank = 0;
      for (const board of slots()) {
        const left = Math.max(0, v.x + board.x * v.k), top = Math.max(0, v.y + board.y * v.k);
        const right = Math.min(width, v.x + (board.x + board.w) * v.k), bottom = Math.min(height, v.y + (board.y + board.h) * v.k);
        const visible = Math.max(0, right - left) * Math.max(0, bottom - top);
        area += visible;
        if (visible && !drawn(board.slot, now)) frameBlank += visible;
      }
      blank += frameBlank;
      if (frameBlank) blankFrames++;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame((now) => { last = now; requestAnimationFrame(tick); });
    return () => {
      running = false;
      const sorted = deltas.slice(1).sort((a, b) => a - b);
      const at = (p) => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0);
      return { frames: sorted.length, p95: at(0.95), max: at(1), over25: sorted.filter((d) => d > 25).length, over33: sorted.filter((d) => d > 33).length, blankPct: +(area ? (100 * blank) / area : 0).toFixed(2), blankFrames };
    };
  };
  window.PERF = { raf, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)), view, slots, wheel, zoomTo, centerOn, focus, fit, record };
})()`;

export async function launch({ width = 1440, height = 900, profile } = {}) {
  const dir = profile ?? mkdtempSync(path.join(tmpdir(), 'ryugi-perf-chrome-'));
  const port = 9400 + Math.floor(Math.random() * 500);
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${width},${height + 87}`, '--window-position=0,0', 'about:blank'], { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 100 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); } catch { await sleep(100); }
  }
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let next = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (message) => {
    const data = JSON.parse(message.data);
    if (data.method) for (const listener of listeners.get(data.method) ?? []) listener(data.params);
    if (!data.id || !pending.has(data.id)) return;
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(JSON.stringify(data.error)));
    else resolve(data.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++next;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetInfos } = await send('Target.getTargets');
  const { sessionId } = await send('Target.attachToTarget', { targetId: targetInfos.find((target) => target.type === 'page').targetId, flatten: true });
  const page = (method, params) => send(method, params, sessionId);
  await page('Page.enable');
  await page('Runtime.enable');
  await page('Page.addScriptToEvaluateOnNewDocument', { source: PROBES });

  const evaluate = async (expression, timeout = 180000) => {
    const result = await Promise.race([
      page('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      sleep(timeout).then(() => { throw new Error('evaluate timed out'); }),
    ]);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  const open = async (url, boards) => {
    await page('Page.navigate', { url });
    for (let i = 0; i < 300; i++) {
      if (await evaluate(`document.querySelectorAll('[data-board]').length`).catch(() => 0) >= boards) return;
      await sleep(100);
    }
    throw new Error('the artboard never rendered its boards');
  };
  const footprint = async () => {
    const { processInfo } = await send('SystemInfo.getProcessInfo');
    let total = 0;
    for (const info of processInfo) {
      if (info.type !== 'renderer' && info.type !== 'GPU') continue;
      try {
        const match = execFileSync('footprint', ['-p', String(info.id)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).match(/Footprint:\s+([\d.]+)\s+([KMG]B)/);
        if (match) total += Number(match[1]) * { KB: 1 / 1024, MB: 1, GB: 1024 }[match[2]];
      } catch {}
    }
    return Math.round(total);
  };
  const close = async () => {
    try { await send('Browser.close'); } catch {}
    await sleep(500);
    proc.kill('SIGKILL');
    if (!profile) rmSync(dir, { recursive: true, force: true });
  };
  const on = (method, listener) => listeners.set(method, [...(listeners.get(method) ?? []), listener]);
  return { evaluate, open, footprint, close, dir, page, on };
}

export function boardCount({ project, artifact }) {
  const canvas = JSON.parse(readFileSync(path.join(project, '.ryugi/artifacts', artifact, 'canvas.json'), 'utf8'));
  const page = canvas.activePage ?? canvas.pages[0].id;
  return Object.values(canvas.boards).filter((board) => board.page === page).length;
}

// Every board goes live once, so the measured run starts with snapshots in IndexedDB.
export const WARM_UP = `(async () => {
  const { slots, focus, sleep } = PERF;
  for (const board of slots()) { await focus(board.id, 0.5, 300); await sleep(2500); }
})()`;
