// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { injectRuntime } from '../src/server/inject';

let posted: Record<string, any>[];
const observers: MutationObserver[] = [];
const listeners: EventListener[] = [];
const NativeObserver = window.MutationObserver;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const reports = (type: string) => posted.filter((message) => message.type === `ryugi:board:${type}`);

beforeEach(() => {
  document.body.innerHTML = '<main><h1>Board</h1><p id="copy">Copy</p></main>';
  posted = [];
  window.MutationObserver = class extends NativeObserver {
    constructor(callback: MutationCallback) { super(callback); observers.push(this); }
  };
  vi.spyOn(window.parent, 'postMessage').mockImplementation((message) => posted.push(message));
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => {
    if (type === 'message') listeners.push(listener);
    add(type, listener, options);
  }) as typeof window.addEventListener);
  const html = injectRuntime('<p>test</p>', { inspector: true });
  new Function(html.slice('<script>'.length, html.indexOf('</script>')))();
});

afterEach(() => {
  for (const observer of observers.splice(0)) observer.disconnect();
  for (const listener of listeners.splice(0)) window.removeEventListener('message', listener);
  window.MutationObserver = NativeObserver;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test('a loaded board reports ready once its fonts and finite animations have settled', async () => {
  await sleep(100);
  expect(reports('ready')).toHaveLength(1);
});

test('a burst of DOM changes is reported once, 500 ms after the last change', async () => {
  await sleep(50);
  const copy = document.getElementById('copy')!;
  copy.textContent = 'one';
  await sleep(200);
  copy.textContent = 'two';
  document.documentElement.style.setProperty('--tweak-accent', '#f00');
  await sleep(400);
  expect(reports('changed')).toHaveLength(0);
  await sleep(200);
  expect(reports('changed')).toHaveLength(1);
});

test('the inspector drawing its own overlay is not a change to the board', async () => {
  await sleep(50);
  const overlay = document.createElement('style');
  overlay.setAttribute('data-ryugi-inspector', '');
  document.head.append(overlay);
  overlay.textContent = '*{cursor:default}';
  await sleep(650);
  expect(reports('changed')).toHaveLength(0);
});

const served: Record<string, { body: string; type: string } | undefined> = {
  'https://board.test/pages/shot.png': { body: 'PNG', type: 'image/png' },
  'https://board.test/pages/theme.css': { body: '@font-face{font-family:Brand;src:url("fonts/brand.woff2")}body{background:url(bg.png)}', type: 'text/css' },
  'https://board.test/pages/fonts/brand.woff2': { body: 'WOFF', type: 'font/woff2' },
  'https://board.test/pages/bg.png': { body: 'BG', type: 'image/png' },
  'https://board.test/pages/cjk.css': { body: '@font-face{font-family:"Han Sans";font-weight:400;src:url(fonts/han-0.woff2);unicode-range:U+4E00-4FFF}@font-face{font-family:"Han Sans";font-weight:400;src:url(fonts/han-1.woff2);unicode-range:U+5000-5FFF}@font-face{font-family:Other;src:url(fonts/other.woff2)}', type: 'text/css' },
  'https://board.test/pages/fonts/han-0.woff2': { body: 'HAN0', type: 'font/woff2' },
  'https://board.test/pages/fonts/other.woff2': { body: 'OTHER', type: 'font/woff2' },
  'https://board.test/pages/tile.png': { body: 'TILE', type: 'image/png' },
};

function page(html: string) {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const win = frame.contentWindow as Window & typeof globalThis;
  win.document.open();
  win.document.write(`<!doctype html><html><head><base href="https://board.test/pages/"></head><body>${html}</body></html>`);
  win.document.close();
  vi.spyOn(win, 'fetch').mockImplementation(async (input) => {
    const file = served[String(input)];
    return file ? new Response(file.body, { headers: { 'Content-Type': file.type } }) : new Response('', { status: 404 });
  });
  return win;
}

test('the board is serialized into an SVG with every resource it needs inlined', async () => {
  const win = page(`
    <link rel="stylesheet" href="theme.css">
    <style>:root{--accent:red}.tile{background-image:url('tile.png')}</style>
    <img src="shot.png" srcset="shot.png 2x" alt="">
    <x-icon></x-icon>
    <input value="typed">
    <script>window.secret = 1</script>
    <style data-ryugi-inspector>*{cursor:default}</style>`);
  const icon = win.document.querySelector('x-icon')!;
  icon.attachShadow({ mode: 'open' }).innerHTML = '<style>:host{display:inline-flex}</style><svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>';
  (win.document.querySelector('input') as HTMLInputElement).value = 'changed';
  const { serializeBoard } = await import('../src/inspector/snapshot');
  const { svg, width, height } = await serializeBoard(win);
  expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject`)).toBe(true);
  expect(svg).toContain(`data:image/png;base64,${btoa('PNG')}`);
  expect(svg).not.toContain('srcset');
  expect(svg).toContain(`data:font/woff2;base64,${btoa('WOFF')}`);
  expect(svg).toContain(`data:image/png;base64,${btoa('BG')}`);
  expect(svg).toContain(`data:image/png;base64,${btoa('TILE')}`);
  expect(svg).not.toContain('theme.css');
  expect(svg).toContain('html{--accent:red}');
  expect(svg).toContain('<path d="M0 0h24"');
  expect(svg).toContain('value="changed"');
  expect(svg).not.toContain('window.secret');
  expect(svg).not.toContain('cursor:default');
});

test('animations are pinned to their end in the snapshot, since an SVG image would show their first keyframe', async () => {
  const win = page('<style>.card{animation:in 2s both}@keyframes in{from{opacity:0}}</style><div class="card">Card</div>');
  const { serializeBoard } = await import('../src/inspector/snapshot');
  const { svg } = await serializeBoard(win);
  expect(svg).toMatch(/\*,\s*\*::before,\s*\*::after\s*\{[^}]*animation-delay:\s*-\d+s\s*!important;[^}]*animation-play-state:\s*paused\s*!important/);
  expect(svg).toMatch(/transition:\s*none\s*!important/);
});

test('only the font faces the board has loaded are inlined, so unused slices are never fetched', async () => {
  const win = page('<link rel="stylesheet" href="cjk.css"><p>汉字</p>');
  Object.defineProperty(win.document, 'fonts', { configurable: true, value: [
    { family: '"Han Sans"', weight: '400', style: 'normal', unicodeRange: 'U+4E00-4FFF', status: 'loaded' },
    { family: '"Han Sans"', weight: '400', style: 'normal', unicodeRange: 'U+5000-5FFF', status: 'unloaded' },
  ] });
  const { serializeBoard } = await import('../src/inspector/snapshot');
  const { svg } = await serializeBoard(win);
  expect(svg).toContain(`data:font/woff2;base64,${btoa('HAN0')}`);
  expect(svg).not.toContain('han-1');
  expect(svg).toContain(`data:font/woff2;base64,${btoa('OTHER')}`);
});

test.each([
  ['a video', '<video src="clip.mp4"></video>'],
  ['an embedded frame', '<iframe src="other.html"></iframe>'],
  ['an image that cannot be fetched', '<img src="missing.png" alt="">'],
  ['a stylesheet that cannot be fetched', '<link rel="stylesheet" href="missing.css">'],
])('a board with %s cannot be snapshotted', async (_label, html) => {
  const { serializeBoard } = await import('../src/inspector/snapshot');
  await expect(serializeBoard(page(html))).rejects.toThrow();
});

test('a capture request from the viewer always gets an answer, here an unsupported board', async () => {
  document.body.innerHTML = '<video src="clip.mp4"></video>';
  window.dispatchEvent(new MessageEvent('message', { source: window.parent, data: { type: 'ryugi:board:capture', request: 7, scale: 1 } }));
  await sleep(50);
  expect(reports('snapshot')).toEqual([{ type: 'ryugi:board:snapshot', request: 7, error: expect.stringContaining('video') }]);
});

test('capture requests from anyone but the viewer are ignored', async () => {
  window.dispatchEvent(new MessageEvent('message', { source: null, data: { type: 'ryugi:board:capture', request: 8, scale: 1 } }));
  await sleep(50);
  expect(reports('snapshot')).toEqual([]);
});

test('pressing a pointer or a key inside the board reports an interaction', async () => {
  expect(reports('interacted')).toHaveLength(0);
  document.getElementById('copy')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  expect(reports('interacted').length).toBeGreaterThan(0);
  posted.length = 0;
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  expect(reports('interacted').length).toBeGreaterThan(0);
});
