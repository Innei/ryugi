// @vitest-environment happy-dom
import { act, createElement, type ComponentProps } from 'react';
import { MotionGlobalConfig } from 'motion/react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { VideoPlayer } from '../src/viewer/components/VideoPlayer';

vi.mock('@stylexjs/stylex', async (original) => ({ ...await original<object>(), create: (value: unknown) => value, props: () => ({}) }));
vi.mock('@lobehub/ui/stylex/cssVar.stylex', () => ({ cssVar: new Proxy({}, { get: (_, key) => `var(--${String(key)})` }) }));

let root: Root | null = null;
beforeAll(() => {
  MotionGlobalConfig.skipAnimations = true;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

async function render(props: Partial<ComponentProps<typeof VideoPlayer>> = {}) {
  const host = document.createElement('div');
  const outer = vi.fn();
  document.body.append(host);
  root = createRoot(host);
  const player = createElement(VideoPlayer, { src: 'flow.webm', title: 'flow', barScale: 1, barWidth: 640, onExpand: vi.fn(), ...props });
  await act(async () => root!.render(createElement('div', { onPointerDown: outer }, player)));
  const video = host.querySelector('video')!;
  Object.defineProperty(video, 'duration', { configurable: true, value: 12 });
  await act(async () => video.dispatchEvent(new Event('loadedmetadata')));
  return { host, video, outer };
}

const button = (host: HTMLElement, label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

test('the bar shows the time and plays and pauses the video', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  const { host, video } = await render();
  expect(host.textContent).toContain('0:00 / 0:12');
  await act(async () => button(host, '播放').click());
  expect(play).toHaveBeenCalled();
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 4 });
  await act(async () => video.dispatchEvent(new Event('timeupdate')));
  expect(host.textContent).toContain('0:04 / 0:12');
  expect(button(host, '暂停')).not.toBeNull();
});

test('speed cycles, loop toggles, and expand reports back', async () => {
  const onExpand = vi.fn();
  const { host, video } = await render({ onExpand });
  await act(async () => button(host, '倍速').click());
  expect(video.playbackRate).toBe(1.5);
  expect(button(host, '倍速').textContent).toBe('1.5×');
  await act(async () => button(host, '循环').click());
  expect(video.loop).toBe(true);
  expect(button(host, '循环').getAttribute('aria-pressed')).toBe('true');
  await act(async () => button(host, '放大').click());
  expect(onExpand).toHaveBeenCalled();
});

test('a press on the track seeks there, and presses on the bar never reach the canvas', async () => {
  const { host, video, outer } = await render();
  const track = host.querySelector<HTMLElement>('[role="slider"]')!;
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 100, width: 200, top: 0, height: 4, right: 300, bottom: 4, x: 100, y: 0, toJSON: () => ({}) });
  await act(async () => track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 150, pointerId: 1 })));
  expect(video.currentTime).toBe(3);
  expect(outer).not.toHaveBeenCalled();
});

test('the bar hides when the board is too small on screen to use it', async () => {
  const { host } = await render({ barWidth: 120 });
  expect(button(host, '播放')).toBeNull();
});

test('a video that cannot load says so instead of sitting black', async () => {
  const { host, video } = await render();
  await act(async () => video.dispatchEvent(new Event('error')));
  expect(host.textContent).toContain('视频加载失败');
});

test('clicking the video surface toggles playback even when the control bar is hidden', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play')); return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
    this.dispatchEvent(new Event('pause'));
  });
  const { host, video } = await render({ barWidth: 120 });
  const surface = button(host, '播放 flow');
  expect(surface).not.toBeNull();
  await act(async () => surface.click());
  expect(video.paused).toBe(false);
  expect(button(host, '暂停 flow')).toBe(surface);
  await act(async () => surface.click());
  expect(video.paused).toBe(true);
  expect(button(host, '播放 flow')).toBe(surface);
});

test('dragging across the video does not count as a playback click', async () => {
  const { host, video } = await render();
  const surface = button(host, '播放 flow');
  expect(surface).not.toBeNull();
  await act(async () => {
    surface.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
    surface.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1, clientX: 60, clientY: 10 }));
  });
  expect(video.paused).toBe(true);
  expect(button(host, '播放 flow')).toBe(surface);
});


test('a delayed play promise cannot put the icon back in playing state after pause', async () => {
  let started!: () => void;
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    this.dispatchEvent(new Event('play'));
    return new Promise<void>((resolve) => { started = resolve; });
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true }); this.dispatchEvent(new Event('pause'));
  });
  const { host, video } = await render();
  await act(async () => button(host, '播放 flow').click());
  await act(async () => button(host, '暂停 flow').click());
  await act(async () => started());
  expect(video.paused).toBe(true);
  expect(button(host, '播放')).not.toBeNull();
});
