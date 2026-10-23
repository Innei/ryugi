// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { Canvas } from '../src/viewer/components/Canvas';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

let root: Root | null = null;
let intersect: IntersectionObserverCallback = () => {};
const observed = new Set<Element>();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  observed.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const boards: ComponentProps<typeof Canvas>['boards'] = [
  ['a', { file: 'pages/a.html', page: 'p', title: 'First', x: 0, y: 0, w: 640, h: 400 }],
  ['b', { file: 'pages/b.html', page: 'p', title: 'Second', x: 1000, y: 0, w: 640, h: 400 }],
];
const refs = new Map<string, HTMLIFrameElement | null>();
const callbacks = new Map<string, (element: HTMLIFrameElement | null) => void>();
const frameRef = (id: string) => {
  if (!callbacks.has(id)) callbacks.set(id, (element) => refs.set(id, element));
  return callbacks.get(id)!;
};
type Props = Partial<ComponentProps<typeof Canvas>> & { writing?: string; agent?: string; retained?: ReadonlySet<string> };

async function render(props: Props = {}) {
  if (!root) {
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { intersect = callback; }
      observe(element: Element) { observed.add(element); }
      disconnect() { observed.clear(); }
    });
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () => root!.render(createElement(Canvas, {
    view: { x: 0, y: 0, k: 1 }, boards, notes: [], contentBase: 'about:blank#',
    versions: { 'pages/a.html': 1, 'pages/b.html': 1 }, pending: new Set<string>(),
    playing: new Set<string>(), replays: {}, inspecting: true, frameRef, frameLoaded: () => {}, ...props,
  })));
  return document.body;
}

async function visibility(visible: string[]) {
  await act(async () => intersect([...observed].map((target) => ({ target, isIntersecting: visible.includes(target.getAttribute('data-board')!) }) as IntersectionObserverEntry), {} as IntersectionObserver));
}

function animationClock(reduced = false) {
  let now = 0, nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const media = Object.assign(new EventTarget(), { matches: reduced });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++nextId, callback); return nextId; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  return {
    frames, media,
    step(time: number) {
      now = time;
      const pending = [...frames.values()];
      frames.clear();
      act(() => pending.forEach((callback) => callback(time)));
    },
  };
}

function cursorPose() {
  const cursor = document.querySelector<HTMLElement>('[role="status"]')!;
  expect(cursor).not.toBeNull();
  const [x, y] = cursor.style.transform.match(/translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/)!.slice(1).map(Number);
  return { x: x!, y: y!, angle: Number(cursor.querySelector('svg')?.style.transform.match(/rotate\(([-\d.e]+)deg\)/)?.[1] ?? 0) };
}

test('keeps the cursor on a completed HTML board until another complete write arrives', async () => {
  const clock = animationClock();
  const first = { 'pages/a.html': 1 };
  await render({ live: true, agent: 'Codex', versions: first, pending: new Set(['b']) });
  expect(document.querySelector('[role="status"]')).not.toBeNull();
  expect(document.querySelector('[role="status"]')?.getAttribute('aria-label')).toContain('First');
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
  await render({ live: true, agent: 'Codex', versions: first, pending: new Set(['b']), writing: 'b' });
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
  expect(clock.frames.size).toBe(0);
  const second = { ...first, 'pages/b.html': 2 };
  await render({ live: true, agent: 'Codex', versions: second });
  expect(document.querySelector('[role="status"]')?.getAttribute('aria-label')).toContain('Second');
  clock.step(3000);
  expect(cursorPose()).toMatchObject({ x: 1064, y: 80 });
  await render({ live: true, agent: 'Codex', versions: second });
  expect(cursorPose()).toMatchObject({ x: 1064, y: 80 });
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
});

test('moves back when an earlier HTML board is rewritten as a complete file', async () => {
  animationClock(true);
  await render({ live: true, versions: { 'pages/a.html': 1, 'pages/b.html': 2 } });
  expect(cursorPose()).toMatchObject({ x: 1064, y: 80 });
  await render({ live: true, versions: { 'pages/a.html': 3, 'pages/b.html': 2 } });
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
});

test('ignores pending boards and newer media when choosing the last completed HTML', async () => {
  animationClock(true);
  await render({
    live: true,
    boards: [...boards, ['shot', { file: 'pages/shot.png', type: 'image', page: 'p', x: 2000, y: 0, w: 640, h: 400 }]],
    versions: { 'pages/a.html': 1, 'pages/b.html': 2, 'pages/shot.png': 3 },
    pending: new Set(['b']),
  });
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
});

test('does not show a completed-file cursor on static previews or snapshots', async () => {
  await render({ live: false, agent: 'Codex', versions: { 'pages/a.html': 1, 'pages/b.html': 2 } });
  expect(document.querySelector('[role="status"]')).toBeNull();
});

test('flies along a curved route, turns the arrow and arrives without animating the name', async () => {
  const clock = animationClock();
  await render({ writing: 'a', agent: 'Codex' });
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
  await render({ writing: 'b', agent: 'Codex' });
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
  clock.step(500);
  const early = cursorPose();
  expect(early.x).toBeGreaterThan(64);
  expect(Math.abs(early.y - 80)).toBeGreaterThan(10);
  clock.step(1200);
  expect(Math.abs(cursorPose().angle - early.angle)).toBeGreaterThan(10);
  expect(document.querySelector('[role="status"] span')?.textContent).toBe('Codex');
  expect((document.querySelector('[role="status"] span') as HTMLElement).style.transform).toBe('');
  clock.step(3000);
  expect(cursorPose()).toMatchObject({ x: 1064, y: 80 });
  expect(clock.frames.size).toBe(0);
});

test.each([-800, 800])('smoothly hooks back into a target with a %spx height difference', async (height) => {
  const clock = animationClock();
  const targets = [boards[0]!, ['b', { ...boards[1]![1], x: 600, y: height }] as (typeof boards)[number]];
  await render({ boards: targets, writing: 'a' });
  await render({ boards: targets, writing: 'b' });
  const samples: ReturnType<typeof cursorPose>[] = [];
  for (let time = 16; time <= 1904; time += 16) {
    clock.step(time);
    samples.push(cursorPose());
  }
  // Projection beyond the destination proves there is an overshoot and return.
  expect(Math.max(...samples.map((p) => ((p.x - 64) * 600 + (p.y - 80) * height) / (600 ** 2 + height ** 2)))).toBeGreaterThan(1.01);
  const turns = samples.slice(1).map((p, i) => Math.abs((p.angle - samples[i]!.angle + 540) % 360 - 180));
  expect(Math.max(...turns)).toBeLessThan(30);
  expect(cursorPose()).toMatchObject({ x: 664, y: height + 80 });
  expect(clock.frames.size).toBe(0);
});

test('retargets from the visible cursor and keeps its route when the camera changes', async () => {
  const clock = animationClock();
  await render({ writing: 'a' });
  await render({ writing: 'b' });
  clock.step(400);
  const before = cursorPose();
  await render({ writing: 'b', view: { x: 200, y: -100, k: 0.5 } });
  expect(cursorPose()).toEqual(before);
  expect(document.querySelector<HTMLElement>('[role="status"]')!.style.transform).toContain('scale(2)');
  clock.step(600);
  expect(cursorPose()).not.toEqual(before);
  const interrupted = cursorPose();
  await render({ writing: 'a' });
  expect(cursorPose()).toEqual(interrupted);
  clock.step(616);
  expect(Math.hypot(cursorPose().x - interrupted.x, cursorPose().y - interrupted.y)).toBeLessThan(2);
  clock.step(3000);
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
  expect(clock.frames.size).toBe(0);
  await render({ writing: 'a', view: { x: 0, y: 0, k: 2 } });
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
  expect(clock.frames.size).toBe(0);
});

test('respects reduced motion changes and cancels an unfinished flight on completion', async () => {
  const clock = animationClock(true);
  await render({ writing: 'a' });
  await render({ writing: 'b' });
  expect(cursorPose()).toMatchObject({ x: 1064, y: 80 });
  expect(clock.frames.size).toBe(0);
  act(() => { clock.media.matches = false; clock.media.dispatchEvent(new Event('change')); });
  await render({ writing: 'a' });
  clock.step(400);
  expect(cursorPose().x).not.toBe(64);
  act(() => { clock.media.matches = true; clock.media.dispatchEvent(new Event('change')); });
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
  expect(clock.frames.size).toBe(0);
  act(() => { clock.media.matches = false; clock.media.dispatchEvent(new Event('change')); });
  await render({ writing: 'b' });
  expect(clock.frames.size).toBe(1);
  await render();
  clock.step(3000);
  expect(document.querySelector('[role="status"]')).toBeNull();
  expect(clock.frames.size).toBe(0);
});

test('keeps every board slot but mounts only nearby frames and releases distant ones', async () => {
  vi.useFakeTimers();
  const host = await render();
  expect(host.querySelectorAll('iframe')).toHaveLength(0);
  expect(host.querySelectorAll('[data-board]')).toHaveLength(2);
  await visibility(['a']);
  expect(host.querySelectorAll('iframe')).toHaveLength(1);
  expect(host.querySelector('iframe')?.title).toBe('First');
  await visibility(['b']);
  expect(host.querySelectorAll('iframe')).toHaveLength(2);
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(host.querySelectorAll('iframe')).toHaveLength(1);
  expect(host.querySelector('iframe')?.title).toBe('Second');
  expect(refs.get('a')).toBeNull();
});

test('returning to the edge cancels unloading instead of restarting a frame', async () => {
  vi.useFakeTimers();
  const host = await render();
  await visibility(['a']);
  const first = host.querySelector('iframe');
  await visibility([]);
  await act(async () => vi.advanceTimersByTime(50));
  await visibility(['a']);
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(host.querySelector('iframe')).toBe(first);
});

test('keeps playing and retained inspector frames alive while offscreen', async () => {
  vi.useFakeTimers();
  const host = await render({ playing: new Set(['a']), retained: new Set(['b']) });
  await visibility([]);
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(host.querySelectorAll('iframe')).toHaveLength(2);
  await render();
  expect(host.querySelectorAll('iframe')).toHaveLength(0);
});

test('separates waiting boards from the named active writer and clears activity on completion', async () => {
  const props = { versions: {}, pending: new Set(['a', 'b']), writing: 'b', agent: 'Codex' };
  const host = await render(props);
  expect(host.querySelector('[data-board="a"]')?.textContent).toContain('Waiting');
  expect(host.querySelector('[data-board="b"]')?.textContent).toContain('Drawing');
  expect(host.querySelector('[data-board="b"]')?.getAttribute('aria-busy')).toBe('true');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Codex');
  await render({ ...props, writing: undefined });
  expect(host.querySelector('[role="status"]')).toBeNull();
  expect(host.querySelector('[aria-busy="true"]')).toBeNull();
});

test('marks revisions without replacing the existing iframe or changing its URL', async () => {
  const host = await render();
  await visibility(['a']);
  const first = host.querySelector('iframe');
  const src = first?.src;
  await render({ writing: 'a' });
  expect(host.querySelector('iframe')).toBe(first);
  expect(first?.src).toBe(src);
  expect(host.querySelector('[data-board="a"]')?.getAttribute('aria-busy')).toBe('true');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Agent');
  await render({ writing: 'another-page' });
  expect(host.querySelector('[role="status"]')).toBeNull();
});

test.each([
  ['#cce8df', '#cce8df', '#000'],
  ['#123', '#123', '#fff'],
  ['#777777', '#777777', '#000'],
  [undefined, '#fff6db', '#3d2e00'],
])('renders a %s sticky with readable foreground', async (color, background, foreground) => {
  const host = await render({ notes: [['note', { page: 'p', kind: 'sticky', x: 0, y: 500, text: 'Decision', color }]] });
  const note = [...host.querySelectorAll('div')].find((el) => el.textContent === 'Decision' && !el.querySelector('div'))!;
  expect(note.style.backgroundColor).toBe(background);
  expect(note.style.color).toBe(foreground);
});

test('image and video boards render as media, not as iframes', async () => {
  const media: ComponentProps<typeof Canvas>['boards'] = [
    ['shot', { type: 'image', src: 'pages/shot.png', file: 'pages/shot.png', page: 'p', x: 0, y: 0, w: 640, h: 400 }],
    ['flow', { type: 'video', src: 'pages/flow.webm', file: 'pages/flow.webm', page: 'p', x: 1000, y: 0, w: 640, h: 400 }],
  ];
  const body = await render({ boards: media, versions: { 'pages/shot.png': 3, 'pages/flow.webm': 4 } });
  await visibility(['shot', 'flow']);
  expect(body.querySelector('iframe')).toBeNull();
  expect(body.querySelector('img')?.getAttribute('src')).toBe('about:blank#pages/shot.png?v=3');
  const video = body.querySelector('video')!;
  expect(video.getAttribute('src')).toBe('about:blank#pages/flow.webm?v=4');
  expect(video.hasAttribute('controls')).toBe(false);
  expect(body.querySelector('[aria-label="播放"]')).not.toBeNull();
});
