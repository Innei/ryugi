// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { injectRuntime } from '../src/server/inject';

let posted: Record<string, any>[];
let root: HTMLElement;
let onMessage: ((event: MessageEvent) => void) | undefined;

beforeEach(() => {
  document.body.innerHTML = '<main aria-label="Article"><h1>Heading</h1><section id="card" style="color: red !important; padding: 12px"><button>Continue</button></section></main>';
  root = document.getElementById('card')!;
  posted = [];
  vi.spyOn(window.parent, 'postMessage').mockImplementation((message) => posted.push(message));
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => {
    if (type === 'message') onMessage = listener as (event: MessageEvent) => void;
    add(type, listener, options);
  }) as typeof window.addEventListener);
  const html = injectRuntime('<p>test</p>', { inspector: true } as Parameters<typeof injectRuntime>[1]);
  const code = html.slice('<script>'.length, html.indexOf('</script>'));
  new Function(code)();
});

afterEach(() => {
  command('disable');
  if (onMessage) window.removeEventListener('message', onMessage as EventListener);
  onMessage = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function command(action: string, fields: Record<string, unknown> = {}, source = window.parent) {
  window.dispatchEvent(new MessageEvent('message', { source, data: { type: 'ryugi:inspect', action, connection: 'test-connection', session: last('tree')?.session, ...fields } }));
}

const last = (type: string) => posted.filter((message) => message.type === `ryugi:inspect:${type}`).at(-1);

function cardId() {
  command('enable');
  const tree = last('tree');
  expect(tree).toBeDefined();
  expect(tree!.nodes.length).toBeGreaterThan(0);
  const card = tree!.nodes.find((node: { selector: string }) => node.selector === '#card');
  expect(card).toBeDefined();
  return card.id;
}

test('inspection is opt-in and reports the live DOM with stable IDs', () => {
  expect(last('tree')).toBeUndefined();
  const id = cardId();
  command('enable');
  expect(last('tree')!.nodes.find((node: { selector: string }) => node.selector === '#card').id).toBe(id);
  expect(last('tree')!.session).toEqual(expect.any(String));
  expect(last('tree')!.nodes.some((node: { tag: string }) => node.tag === 'script')).toBe(false);
});

test('select mode intercepts clicks, and disabling it restores page interactions', () => {
  cardId();
  const button = root.querySelector('button')!;
  const action = vi.fn();
  button.addEventListener('click', action);
  button.click();
  expect(action).not.toHaveBeenCalled();
  expect(last('selection')!.selection.tag).toBe('button');
  command('disable');
  button.click();
  expect(action).toHaveBeenCalledOnce();
});

test('style preview resets only properties it owns and preserves inline priority', () => {
  const id = cardId();
  command('select', { id });
  command('style', { id, property: 'color', value: 'blue' });
  command('style', { id, property: 'border-radius', value: '8px' });
  expect(root.style.color).toBe('blue');
  root.style.setProperty('margin', '4px');
  command('reset');
  expect(root.style.color).toBe('red');
  expect(root.style.getPropertyPriority('color')).toBe('important');
  expect(root.style.borderRadius).toBe('');
  expect(root.style.padding).toBe('12px');
  expect(root.style.margin).toBe('4px');
});

test('foreign senders and unsupported properties cannot mutate the page', () => {
  const id = cardId();
  command('select', { id });
  command('style', { id, property: 'color', value: 'blue' }, {} as Window);
  command('style', { id, property: 'background-image', value: 'url(https://example.com)' });
  expect(root.style.color).toBe('red');
  expect(root.style.backgroundImage).toBe('');
});

test('reset preserves a later page-owned change to an overridden property', () => {
  const id = cardId();
  command('select', { id });
  command('style', { id, property: 'color', value: 'blue' });
  root.style.color = 'green';
  command('reset');
  expect(root.style.color).toBe('green');
});

test('reset restores original shorthand longhands and their priorities', () => {
  root.style.cssText = 'padding-left: 12px !important; border-top-left-radius: 8px; border-top-style: dashed; row-gap: 3px';
  const id = cardId();
  command('select', { id });
  for (const [property, value] of [['padding', '20px'], ['border-radius', '10px'], ['border-style', 'solid'], ['gap', '9px']]) command('style', { id, property, value });
  root.style.color = 'green';
  command('reset');
  expect(root.style.paddingLeft).toBe('12px');
  expect(root.style.getPropertyPriority('padding-left')).toBe('important');
  expect(root.style.borderTopLeftRadius).toBe('8px');
  expect(root.style.borderTopStyle).toBe('dashed');
  expect(root.style.rowGap).toBe('3px');
  expect(root.style.color).toBe('green');
});

test('re-enabling a frame reports remembered selection as a passive update', () => {
  const id = cardId();
  command('select', { id });
  expect(last('selection')?.reason).toBe('command');
  command('disable');
  command('enable');
  expect(last('selection')?.reason).toBe('update');
});

test('geometry follows selected and hovered nodes without rebuilding the DOM tree', () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length; });
  let x = 0;
  vi.spyOn(root, 'getBoundingClientRect').mockImplementation(() => ({ x, y: 0, width: 100, height: 50 }) as DOMRect);
  const id = cardId();
  command('select', { id });
  command('hover', { id });
  const treeCount = posted.filter((message) => message.type === 'ryugi:inspect:tree').length;
  x = 42;
  frames.shift()?.(0);
  expect(last('rect')).toMatchObject({ id, rect: { x: 42, width: 100 } });
  expect(last('hover')?.rect.x).toBe(42);
  expect(posted.filter((message) => message.type === 'ryugi:inspect:tree')).toHaveLength(treeCount);
  command('disable');
  const count = posted.length;
  frames.shift()?.(16);
  expect(posted).toHaveLength(count);
});

test('commands from a previous connection cannot edit a current selection', () => {
  const id = cardId();
  command('select', { id });
  command('style', { id, property: 'color', value: 'blue', connection: 'retired-connection' });
  expect(root.style.color).toBe('red');
});

test('removing the selected node clears the selection and updates the tree', async () => {
  const id = cardId();
  command('select', { id });
  root.remove();
  await vi.waitFor(() => expect(last('selection')?.selection).toBeNull());
  expect(last('tree')!.nodes.some((node: { id: number }) => node.id === id)).toBe(false);
});
