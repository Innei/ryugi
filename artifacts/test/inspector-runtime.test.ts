// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { injectRuntime } from '../src/server/inject';

let posted: Record<string, any>[];
let root: HTMLElement;
const onMessage: EventListener[] = [];

beforeEach(() => {
  document.body.innerHTML = '<main aria-label="Article"><h1>Heading</h1><section id="card" style="color: red !important; padding: 12px"><button>Continue</button></section></main>';
  root = document.getElementById('card')!;
  posted = [];
  vi.spyOn(window.parent, 'postMessage').mockImplementation((message) => posted.push(message));
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => {
    if (type === 'message') onMessage.push(listener);
    add(type, listener, options);
  }) as typeof window.addEventListener);
  const html = injectRuntime('<p>test</p>', { inspector: true } as Parameters<typeof injectRuntime>[1]);
  const code = html.slice('<script>'.length, html.indexOf('</script>'));
  new Function(code)();
});

afterEach(() => {
  command('disable');
  for (const listener of onMessage.splice(0)) window.removeEventListener('message', listener);
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

test('Shift clicking requests a toggle, and tracked selections keep their geometry in sync', () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { frames.push(callback); return frames.length; });
  const id = cardId();
  const heading = document.querySelector('h1')!;
  let x = 10;
  vi.spyOn(heading, 'getBoundingClientRect').mockImplementation(() => ({ x, y: 0, width: 90, height: 30 }) as DOMRect);
  heading.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  expect(last('selection')?.toggle).toBe(true);
  const headingId = last('selection')!.selection.id;
  command('track', { ids: [headingId, id] });
  x = 25;
  frames.shift()?.(0);
  expect(posted.some((message) => message.type === 'ryugi:inspect:rect' && message.id === headingId && message.rect.x === 25)).toBe(true);
});

test('marquee leaves are the outermost visible content nodes with their rects', () => {
  const id = cardId();
  const heading = document.querySelector('h1')!;
  const button = root.querySelector('button')!;
  for (const [el, x, y, width, height] of [[heading, 10, 10, 80, 20], [root, 10, 50, 100, 100], [button, 20, 60, 50, 30]] as const) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ x, y, width, height } as DOMRect);
  }
  command('leaves', { request: 1 });
  expect(last('targets')).toMatchObject({ request: 1 });
  expect(last('targets')!.targets).toEqual([
    { id: expect.any(Number), name: 'Heading', rect: { x: 10, y: 10, width: 80, height: 20 } },
    { id: expect.any(Number), name: 'Continue', rect: { x: 20, y: 60, width: 50, height: 30 } },
  ]);
  root.prepend('Card ');
  command('leaves', { request: 2 });
  expect(last('targets')!.targets.map((node: { id: number }) => node.id)).toEqual([expect.any(Number), id]);
  vi.spyOn(heading, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 0, height: 0 } as DOMRect);
  command('leaves', { request: 3 });
  expect(last('targets')!.targets.map((node: { name: string }) => node.name)).toEqual(['card']);
  const count = posted.length;
  command('leaves', { request: 0 });
  expect(posted).toHaveLength(count);
});

test('select mode shows the default cursor over every node and restores the page cursor when disabled', () => {
  cardId();
  const style = document.querySelector('style[data-ryugi-inspector]');
  expect(style?.textContent).toContain('cursor:default!important');
  expect(last('tree')!.nodes.some((node: { tag: string }) => node.tag === 'style')).toBe(false);
  command('disable');
  expect(document.querySelector('style[data-ryugi-inspector]')).toBeNull();
});

test('a pointer drag forwards marquee coordinates and suppresses the resulting page click', () => {
  cardId();
  const pointer = (type: string, x: number, y: number) => root.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: y, screenX: x, screenY: y }));
  pointer('pointerdown', 10, 20);
  pointer('pointermove', 100, 120);
  pointer('pointerup', 100, 120);
  expect(last('drag')).toMatchObject({ phase: 'end', x: 100, y: 120, append: false });
  const count = posted.filter((message) => message.type === 'ryugi:inspect:selection').length;
  root.click();
  expect(posted.filter((message) => message.type === 'ryugi:inspect:selection')).toHaveLength(count);
});

test('every tree node carries a CSS path from body that resolves back to it', () => {
  document.body.insertAdjacentHTML('beforeend', '<ul><li>One</li><li>Two</li></ul>');
  cardId();
  const nodes = last('tree')!.nodes as { path: string; tag: string }[];
  expect(nodes[0]!.path).toBe('body');
  expect(nodes.find((node) => node.tag === 'button')!.path).toBe('body > main > section#card > button');
  const items = nodes.filter((node) => node.tag === 'li').map((node) => node.path);
  expect(items).toEqual(['body > ul > li:nth-of-type(1)', 'body > ul > li:nth-of-type(2)']);
  expect(items.map((path) => document.querySelector(path)?.textContent)).toEqual(['One', 'Two']);
});

test('describe answers text and capped HTML for the requested nodes only', () => {
  const id = cardId();
  const heading = last('tree')!.nodes.find((node: { tag: string }) => node.tag === 'h1').id;
  root.querySelector('button')!.textContent = `Continue ${'x'.repeat(3000)}`;
  command('describe', { request: 7, ids: [heading, id, 99999] });
  const details = last('details')!;
  expect(details.request).toBe(7);
  expect(details.nodes.map((node: { id: number }) => node.id)).toEqual([heading, id]);
  expect(details.nodes[0]).toMatchObject({ text: 'Heading', html: '<h1>Heading</h1>' });
  expect(details.nodes[1].html.length).toBe(2000);
  expect(details.nodes[1].text.length).toBe(200);
  const count = posted.length;
  command('describe', { request: 8, ids: 'nope' });
  expect(posted).toHaveLength(count);
});

test('tweaks report the computed value from before the first change', () => {
  const id = cardId();
  command('select', { id });
  command('style', { id, property: 'padding', value: '20px' });
  command('style', { id, property: 'padding', value: '24px' });
  expect(last('tweaks')!.tweaks).toEqual([{ id, name: 'card', property: 'padding', from: '12px', value: '24px' }]);
});

test('hover reports name the hovered tree node, and a new node with the same rect still reports', () => {
  const id = cardId();
  const heading = last('tree')!.nodes.find((node: { tag: string }) => node.tag === 'h1').id;
  command('hover', { id });
  expect(last('hover')).toMatchObject({ id });
  command('hover', { id: heading });
  expect(last('hover')).toMatchObject({ id: heading });
  command('hover', { id: 99999 });
  expect(last('hover')).toMatchObject({ rect: null, id: null });
});

test('tree paths and tweak origins are clipped to what the viewer accepts', () => {
  root.id = `c${'x'.repeat(5000)}`;
  command('enable');
  const card = last('tree')!.nodes.find((node: { tag: string }) => node.tag === 'section');
  expect(card.path.length).toBeLessThanOrEqual(4000);
});

test('comment mode shows the bubble cursor and swallows clicks without selecting', () => {
  cardId();
  command('mode', { mode: 'comment' });
  const style = document.querySelector('style[data-ryugi-inspector]')!;
  expect(style.textContent).toContain('data:image/svg+xml');
  const button = root.querySelector('button')!;
  const action = vi.fn();
  button.addEventListener('click', action);
  const before = posted.filter((m) => m.type === 'ryugi:inspect:selection').length;
  button.click();
  expect(action).not.toHaveBeenCalled();
  expect(posted.filter((m) => m.type === 'ryugi:inspect:selection')).toHaveLength(before);
  command('mode', { mode: 'select' });
  expect(style.textContent).toBe('*{cursor:default!important}');
  button.click();
  expect(last('selection')!.selection.tag).toBe('button');
});

test('C is forwarded to the canvas so the comment tool works with focus in a board', () => {
  cardId();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', bubbles: true }));
  expect(last('key')).toMatchObject({ key: 'c', code: 'KeyC', down: true });
});

test('the mode can be set right after enabling, before the frame knows its session', () => {
  command('enable');
  window.dispatchEvent(new MessageEvent('message', { source: window.parent, data: { type: 'ryugi:inspect', action: 'mode', mode: 'comment', connection: 'test-connection', session: null } }));
  expect(document.querySelector('style[data-ryugi-inspector]')!.textContent).toContain('data:image/svg+xml');
});
