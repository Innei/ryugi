// @vitest-environment happy-dom
import { act, type ComponentProps, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { Canvas } from '../src/viewer/components/Canvas';
import type { BoardPhase } from '../src/viewer/lib/board-lifecycle';

vi.mock('@stylexjs/stylex', async (original) => ({
  ...(await original<object>()),
  create: (value: unknown) => value,
  keyframes: (value: unknown) => value,
  props: () => ({}),
}));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({
  cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }),
}));

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
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
type Props = Partial<ComponentProps<typeof Canvas>> & { writing?: string; agent?: string };

async function render(props: Props = {}) {
  if (!root) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () =>
    root!.render(
      createElement(Canvas, {
        view: { x: 0, y: 0, k: 1 },
        boards,
        notes: [],
        contentBase: 'about:blank#',
        versions: { 'pages/a.html': 1, 'pages/b.html': 1 },
        pending: new Set<string>(),
        playing: new Set<string>(),
        replays: {},
        inspecting: true,
        frameRef,
        frameLoaded: () => {},
        ...props,
      }),
    ),
  );
  return document.body;
}

function animationClock(reduced = false) {
  let now = 0,
    nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const media = Object.assign(new EventTarget(), { matches: reduced });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextId, callback);
    return nextId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  return {
    frames,
    media,
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
  const [x, y] = cursor.style.transform
    .match(/translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)/)!
    .slice(1)
    .map(Number);
  return {
    x: x!,
    y: y!,
    angle: Number(
      cursor.querySelector('svg')?.style.transform.match(/rotate\(([-\d.e]+)deg\)/)?.[1] ?? 0,
    ),
  };
}

test('keeps the cursor on a completed HTML board until another complete write arrives', async () => {
  const clock = animationClock();
  const first = { 'pages/a.html': 1 };
  await render({ live: true, agent: 'Codex', versions: first, pending: new Set(['b']) });
  expect(document.querySelector('[role="status"]')).not.toBeNull();
  expect(document.querySelector('[role="status"]')?.getAttribute('aria-label')).toContain('First');
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
  await render({
    live: true,
    agent: 'Codex',
    versions: first,
    pending: new Set(['b']),
    writing: 'b',
  });
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
    boards: [
      ...boards,
      ['shot', { file: 'pages/shot.png', type: 'image', page: 'p', x: 2000, y: 0, w: 640, h: 400 }],
    ],
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

test('fills the agent arrow with its own blue-to-purple gradient so it never reads as the human pointer', async () => {
  await render({ writing: 'a' });
  const cursor = document.querySelector<HTMLElement>('[role="status"]')!;
  const gradient = cursor.querySelector('linearGradient')!;
  expect(gradient).not.toBeNull();
  expect(gradient.querySelectorAll('stop')).toHaveLength(2);
  const filled = [...cursor.querySelectorAll('path')].filter((path) =>
    path.getAttribute('fill')?.startsWith('url(#'),
  );
  expect(filled).toHaveLength(1);
  expect(filled[0]!.getAttribute('fill')).toBe(`url(#${gradient.id})`);
});

test('flies the agent arrow without a trail and labels it with the agent name alone', async () => {
  const clock = animationClock();
  await render({ writing: 'a' });
  await render({ writing: 'b' });
  clock.step(500);
  const cursor = document.querySelector<HTMLElement>('[role="status"]')!;
  expect(cursor.querySelector('[data-trail]')).toBeNull();
  expect(cursor.querySelectorAll('svg')).toHaveLength(1);
});

test.each([-800, 800])(
  'smoothly hooks back into a target with a %spx height difference',
  async (height) => {
    const clock = animationClock();
    const targets = [
      boards[0]!,
      ['b', { ...boards[1]![1], x: 600, y: height }] as (typeof boards)[number],
    ];
    await render({ boards: targets, writing: 'a' });
    await render({ boards: targets, writing: 'b' });
    const samples: ReturnType<typeof cursorPose>[] = [];
    for (let time = 16; time <= 1904; time += 16) {
      clock.step(time);
      samples.push(cursorPose());
    }
    // Projection beyond the destination proves there is an overshoot and return.
    expect(
      Math.max(
        ...samples.map((p) => ((p.x - 64) * 600 + (p.y - 80) * height) / (600 ** 2 + height ** 2)),
      ),
    ).toBeGreaterThan(1.01);
    const turns = samples
      .slice(1)
      .map((p, i) => Math.abs(((p.angle - samples[i]!.angle + 540) % 360) - 180));
    expect(Math.max(...turns)).toBeLessThan(30);
    expect(cursorPose()).toMatchObject({ x: 664, y: height + 80 });
    expect(clock.frames.size).toBe(0);
  },
);

test('retargets from the visible cursor and keeps its route when the camera changes', async () => {
  const clock = animationClock();
  await render({ writing: 'a' });
  await render({ writing: 'b' });
  clock.step(400);
  const before = cursorPose();
  await render({ writing: 'b', view: { x: 200, y: -100, k: 0.5 } });
  expect(cursorPose()).toEqual(before);
  expect(document.querySelector<HTMLElement>('[role="status"]')!.style.transform).toContain(
    'scale(2)',
  );
  clock.step(600);
  expect(cursorPose()).not.toEqual(before);
  const interrupted = cursorPose();
  await render({ writing: 'a' });
  expect(cursorPose()).toEqual(interrupted);
  clock.step(616);
  expect(Math.hypot(cursorPose().x - interrupted.x, cursorPose().y - interrupted.y)).toBeLessThan(
    2,
  );
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
  act(() => {
    clock.media.matches = false;
    clock.media.dispatchEvent(new Event('change'));
  });
  await render({ writing: 'a' });
  clock.step(400);
  expect(cursorPose().x).not.toBe(64);
  act(() => {
    clock.media.matches = true;
    clock.media.dispatchEvent(new Event('change'));
  });
  expect(cursorPose()).toMatchObject({ x: 64, y: 80 });
  expect(clock.frames.size).toBe(0);
  act(() => {
    clock.media.matches = false;
    clock.media.dispatchEvent(new Event('change'));
  });
  await render({ writing: 'b' });
  expect(clock.frames.size).toBe(1);
  await render();
  clock.step(3000);
  expect(document.querySelector('[role="status"]')).toBeNull();
  expect(clock.frames.size).toBe(0);
});

const at = (phases: Record<string, BoardPhase>) => new Map(Object.entries(phases));
const frameOf = (host: HTMLElement, id: string) =>
  host.querySelector<HTMLIFrameElement>(`[data-board="${id}"] iframe`);
const imageOf = (host: HTMLElement, id: string) =>
  host.querySelector<HTMLImageElement>(`[data-board="${id}"] img`);

test('every ready board mounts a frame when no phase says otherwise', async () => {
  const host = await render();
  expect(host.querySelectorAll('iframe')).toHaveLength(2);
  expect(host.querySelectorAll('img')).toHaveLength(0);
});

test('an unloaded board shows its capture instead of a frame', async () => {
  const host = await render({
    phases: at({ a: 'mounted', b: 'unloaded' }),
    images: new Map([['b', 'blob:b']]),
  });
  expect(frameOf(host, 'a')).not.toBeNull();
  expect(frameOf(host, 'b')).toBeNull();
  expect(imageOf(host, 'b')?.getAttribute('src')).toBe('blob:b');
});

test('a restoring board keeps its capture over a frame that is loading', async () => {
  const host = await render({
    phases: at({ a: 'restoring', b: 'mounted' }),
    images: new Map([['a', 'blob:a']]),
  });
  expect(frameOf(host, 'a')).not.toBeNull();
  expect(imageOf(host, 'a')?.getAttribute('src')).toBe('blob:a');
});

test('an unloaded board without a capture keeps its frame rather than going blank', async () => {
  const host = await render({ phases: at({ a: 'unloaded', b: 'mounted' }) });
  expect(frameOf(host, 'a')).not.toBeNull();
});

test('a capturing board keeps its frame and shows no image', async () => {
  const host = await render({
    phases: at({ a: 'capturing', b: 'mounted' }),
    images: new Map([['a', 'blob:old']]),
  });
  expect(frameOf(host, 'a')).not.toBeNull();
  expect(imageOf(host, 'a')).toBeNull();
});

test('culled boards are hidden but keep their frame', async () => {
  const host = await render();
  const frame = frameOf(host, 'b');
  await render({ culled: new Set(['b']) });
  const slot = host.querySelector<HTMLElement>('[data-board="b"]')!;
  expect(slot.style.display).toBe('none');
  expect(frameOf(host, 'b')).toBe(frame);
});

test('a culled board being captured is laid out, unseen, so it captures at its size', async () => {
  const host = await render({ culled: new Set(['b']), phases: at({ b: 'capturing' }) });
  const slot = host.querySelector<HTMLElement>('[data-board="b"]')!;
  expect(slot.style.display).not.toBe('none');
  expect(slot.style.visibility).toBe('hidden');
});

test('frames take no pointer events during a gesture, even while inspecting', async () => {
  const host = await render({ inspecting: true, gesturing: true });
  expect(frameOf(host, 'a')!.style.pointerEvents).toBe('none');
  await render({ inspecting: true, gesturing: false });
  expect(frameOf(host, 'a')!.style.pointerEvents).toBe('');
});

test('the world element is handed to the caller instead of styled from the view', async () => {
  let world: HTMLDivElement | null = null;
  await render({
    worldRef: (element: HTMLDivElement | null) => {
      world = element;
    },
  });
  expect(world).not.toBeNull();
  expect(world!.style.transform).toBe('');
});

test('a board frame survives view changes untouched', async () => {
  const host = await render();
  const frame = frameOf(host, 'a');
  await render({ view: { x: 40, y: 10, k: 0.7 } });
  expect(frameOf(host, 'a')).toBe(frame);
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
  ['#cce8df', '#cce8df', 'var(--color-black)'],
  ['#123', '#123', 'var(--color-white)'],
  ['#777777', '#777777', 'var(--color-black)'],
  [undefined, 'var(--color-paperWarm)', 'var(--color-inkWarm)'],
])('renders a %s sticky with readable foreground', async (color, background, foreground) => {
  const host = await render({
    notes: [['note', { page: 'p', kind: 'sticky', x: 0, y: 500, text: 'Decision', color }]],
  });
  const note = [...host.querySelectorAll('div')].find(
    (el) => el.textContent === 'Decision' && !el.querySelector('div'),
  )!;
  expect(note.style.backgroundColor).toBe(background);
  expect(note.style.color).toBe(foreground);
});

test('image and video boards render as media, not as iframes', async () => {
  const media: ComponentProps<typeof Canvas>['boards'] = [
    [
      'shot',
      {
        type: 'image',
        src: 'pages/shot.png',
        file: 'pages/shot.png',
        page: 'p',
        x: 0,
        y: 0,
        w: 640,
        h: 400,
      },
    ],
    [
      'flow',
      {
        type: 'video',
        src: 'pages/flow.webm',
        file: 'pages/flow.webm',
        page: 'p',
        x: 1000,
        y: 0,
        w: 640,
        h: 400,
      },
    ],
  ];
  const body = await render({
    boards: media,
    versions: { 'pages/shot.png': 3, 'pages/flow.webm': 4 },
  });
  expect(body.querySelector('iframe')).toBeNull();
  expect(body.querySelector('img')?.getAttribute('src')).toBe('about:blank#pages/shot.png?v=3');
  const video = body.querySelector('video')!;
  expect(video.getAttribute('src')).toBe('about:blank#pages/flow.webm?v=4');
  expect(video.hasAttribute('controls')).toBe(false);
  expect(body.querySelector('[aria-label="Play"]')).not.toBeNull();
});

test('board frames load from the board base with its sandbox', async () => {
  const host = await render({
    boardBase: 'http://localhost:4101/c/artboard/AbC/',
    boardSandbox: 'allow-scripts allow-same-origin',
  });
  const frame = frameOf(host, 'a')!;
  expect(frame.getAttribute('src')).toBe('http://localhost:4101/c/artboard/AbC/pages/a.html?v=1');
  expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin');
});
