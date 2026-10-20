// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { INSPECTOR_PROPERTIES, type InspectorNode } from '../src/shared/inspector';
import { useInspector } from '../src/viewer/hooks/useInspector';
import { readInspectorReport } from '../src/viewer/lib/inspector';

const nodes: InspectorNode[] = [{ id: 1, parentId: null, children: [], name: 'Main', tag: 'body', kind: 'Frame', selector: 'body', path: 'body' }];
let host: HTMLDivElement;
let root: Root;
let inspector: ReturnType<typeof useInspector>;
let frame: HTMLIFrameElement;
let sent: any[];

function Harness({ enabled = true }: { enabled?: boolean }) {
  inspector = useInspector({ enabled, playing: new Set(), onInput: () => {} });
  return createElement('iframe', { ref: inspector.refFor('a'), onLoad: () => inspector.loaded('a') });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(Harness)));
  frame = host.querySelector('iframe')!;
  sent = [];
  vi.spyOn(frame.contentWindow!, 'postMessage').mockImplementation((message) => sent.push(message));
  act(() => inspector.loaded('a'));
});

afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const connection = () => sent.filter((message) => message.action === 'enable').at(-1)!.connection;
function report(type: string, data: Record<string, unknown>, source: Window = frame.contentWindow!) {
  act(() => window.dispatchEvent(new MessageEvent('message', { source, data: { type: `ryugi:inspect:${type}`, session: 'session-a', connection: connection(), ...data } })));
}
function select() {
  report('tree', { nodes, truncated: false });
  report('selection', { reason: 'command', selection: { id: 1, tag: 'body', name: 'Main', selector: 'body', rect: { x: 0, y: 0, width: 400, height: 300 }, css: Object.fromEntries(INSPECTOR_PROPERTIES.map((property) => [property, '0px'])), html: '<body></body>', widthMode: 'fixed', heightMode: 'hug' } });
}

test('selection starts empty, Shift toggles nodes and blank-canvas selection clears them', () => {
  report('tree', { nodes, truncated: false });
  expect(sent.some((message) => message.action === 'select')).toBe(false);
  select();
  const node = inspector.selection!.node;
  report('selection', { reason: 'user', toggle: true, selection: { ...node, id: 2, name: 'Second' } });
  expect(inspector.targets.map((target) => target.id)).toEqual([1, 2]);
  report('selection', { reason: 'user', toggle: true, selection: { ...node, id: 2 } });
  expect(inspector.targets.map((target) => target.id)).toEqual([1]);
  act(() => inspector.clearSelection());
  expect(inspector.targets).toEqual([]);
  expect(inspector.selection).toBeNull();
});

const leaves = [
  { id: 2, name: 'Second', rect: { x: 10, y: 10, width: 40, height: 30 } },
  { id: 3, name: 'Third', rect: { x: 200, y: 200, width: 20, height: 20 } },
];
const area = (x: number, y: number, width: number, height: number, boardId = 'a') => [{ boardId, rect: { x, y, width, height } }];
function snapshot(targets = leaves) {
  act(() => inspector.beginArea());
  const request = sent.filter((message) => message.action === 'leaves').at(-1).request;
  report('targets', { request, targets });
  return request;
}

test('the marquee hit-tests the drag-start snapshot synchronously, selecting every node it touches', () => {
  select();
  snapshot();
  act(() => inspector.selectArea(area(0, 0, 100, 100), true));
  expect(inspector.targets.map((target) => target.id)).toEqual([1, 2]);
  act(() => inspector.selectArea(area(45, 35, 160, 170), false));
  expect(inspector.targets.map((target) => target.id)).toEqual([2, 3]);
  expect(inspector.selection).toBeNull();
  expect(sent.some((message) => message.action === 'marquee')).toBe(false);
});

test('live Shift marquee highlights current hits without accumulating nodes that leave the rectangle', () => {
  select();
  snapshot();
  act(() => inspector.selectArea(area(0, 0, 100, 100), true, true));
  expect(inspector.targets.map((target) => target.id)).toEqual([1, 2]);
  expect(inspector.selection?.node.id).toBe(1);
  act(() => inspector.selectArea(area(150, 150, 100, 100), true, true));
  expect(inspector.targets.map((target) => target.id)).toEqual([1, 3]);
  expect(sent.some((message) => message.action === 'select' && message.primary)).toBe(false);
  act(() => inspector.selectArea([], true, true));
  expect(inspector.targets.map((target) => target.id)).toEqual([1]);
  act(() => inspector.cancelDrag());
  expect(inspector.targets.map((target) => target.id)).toEqual([1]);
});

test('a snapshot that answers after the pointer moved or was released still applies', () => {
  select();
  act(() => inspector.beginArea());
  const request = sent.filter((message) => message.action === 'leaves').at(-1).request;
  act(() => inspector.selectArea(area(0, 0, 100, 100), false, true));
  expect(inspector.targets).toEqual([]);
  report('targets', { request, targets: leaves });
  expect(inspector.targets.map((target) => target.id)).toEqual([2]);
  act(() => inspector.beginArea());
  const late = sent.filter((message) => message.action === 'leaves').at(-1).request;
  act(() => inspector.selectArea(area(150, 150, 100, 100), false));
  act(() => inspector.cancelDrag());
  report('targets', { request: late, targets: leaves });
  expect(inspector.targets.map((target) => target.id)).toEqual([3]);
});

test('cancelled or superseded snapshots cannot change the selection', () => {
  select();
  act(() => inspector.beginArea());
  const stale = sent.filter((message) => message.action === 'leaves').at(-1).request;
  act(() => inspector.selectArea(area(0, 0, 100, 100), false, true));
  act(() => inspector.cancelDrag());
  expect(inspector.targets.map((target) => target.id)).toEqual([1]);
  report('targets', { request: stale, targets: leaves });
  expect(inspector.targets.map((target) => target.id)).toEqual([1]);
  snapshot([{ ...leaves[0]!, id: 4 }]);
  report('targets', { request: stale, targets: leaves });
  act(() => inspector.selectArea(area(0, 0, 100, 100), false));
  expect(inspector.targets.map((target) => target.id)).toEqual([4]);
});

test('live marquee spans multiple boards', () => {
  select();
  const second = document.createElement('iframe'); host.append(second);
  act(() => inspector.refFor('b')(second));
  const secondSent: any[] = [];
  vi.spyOn(second.contentWindow!, 'postMessage').mockImplementation((message) => secondSent.push(message));
  act(() => inspector.loaded('b'));
  const secondConnection = secondSent.at(-1).connection;
  report('tree', { connection: secondConnection, nodes, truncated: false }, second.contentWindow!);
  const request = snapshot();
  expect(secondSent.at(-1)).toMatchObject({ action: 'leaves', request });
  report('targets', { connection: secondConnection, request, targets: leaves }, second.contentWindow!);
  act(() => inspector.selectArea([...area(0, 0, 100, 100), ...area(0, 0, 100, 100, 'b')], false, true));
  expect(inspector.targets.map(({ boardId, id }) => [boardId, id])).toEqual([['a', 2], ['b', 2]]);
});

test('registered current frames can select nodes and send session-scoped style commands', () => {
  select();
  expect(inspector.selection?.node.name).toBe('Main');
  act(() => inspector.change('gap', '24px'));
  expect(sent.at(-1)).toMatchObject({ action: 'style', id: 1, session: 'session-a', property: 'gap', value: '24px', connection: connection() });
});

test('foreign sources and retired connections cannot change the selection', () => {
  report('tree', { nodes, truncated: false }, window);
  expect(inspector.frames.a).toBeUndefined();
  select();
  const oldConnection = connection();
  act(() => inspector.loaded('a'));
  report('tree', { nodes, truncated: false, connection: oldConnection });
  expect(inspector.selection).toBeNull();
  expect(inspector.frames.a).toBeUndefined();
});

test('reloads and frame removal discard stale selection and preview changes', () => {
  select();
  report('tweaks', { tweaks: [{ id: 1, name: 'Main', property: 'gap', from: '0px', value: '24px' }] });
  expect(inspector.frames.a?.tweaks).toHaveLength(1);
  act(() => inspector.loaded('a'));
  expect(inspector.selection).toBeNull();
  expect(inspector.frames.a).toBeUndefined();
  select();
  act(() => inspector.refFor('a')(null));
  expect(inspector.frames.a).toBeUndefined();
  expect(inspector.selection).toBeNull();
});

test('closing inspection sends disable without mutating style or resetting the canvas', () => {
  select();
  act(() => root.render(createElement(Harness, { enabled: false })));
  expect(sent.at(-1).action).toBe('disable');
  expect(sent.some((message) => message.action === 'reset')).toBe(false);
});

test('geometry reports update only the currently selected node in their frame', () => {
  select();
  const rect = { x: 42, y: 8, width: 120, height: 60 };
  report('rect', { id: 99, rect });
  expect(inspector.selection?.node.rect.x).toBe(0);
  report('rect', { id: 1, rect });
  expect(inspector.selection?.node.rect).toEqual(rect);
  expect(inspector.selection?.node.name).toBe('Main');
});

test('Reset updates the Tweaks list while inspection is suspended for expanded preview', () => {
  select();
  report('tweaks', { tweaks: [{ id: 1, name: 'Main', property: 'gap', from: '0px', value: '24px' }] });
  act(() => root.render(createElement(Harness, { enabled: false })));
  act(() => inspector.reset());
  expect(sent.at(-1)?.action).toBe('reset');
  report('tweaks', { tweaks: [] });
  expect(inspector.frames.a?.tweaks).toHaveLength(0);
});

test('report validation rejects cycles, invalid coordinates and unsupported CSS properties', () => {
  const header = { session: 's', connection: 'c' };
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:tree', truncated: false, nodes: [{ ...nodes[0], parentId: 1, children: [1] }] })).toBeNull();
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:hover', rect: { x: NaN, y: 0, width: 1, height: 1 } })).toBeNull();
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:tweaks', tweaks: [{ id: 1, name: '', property: 'background-image', value: 'url(x)' }] })).toBeNull();
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:hover', rect: { x: 0, y: 0, width: 1, height: 1 }, id: 3 })).not.toBeNull();
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:hover', rect: { x: 0, y: 0, width: 1, height: 1 }, id: 'x' })).toBeNull();
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:tree', truncated: false, nodes })).not.toBeNull();
  const { path: _, ...pathless } = nodes[0]!;
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:tree', truncated: false, nodes: [pathless] })).toBeNull();
  const tweak = { id: 1, name: 'Main', property: 'gap', from: '0px', value: '24px' };
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:tweaks', tweaks: [tweak] })).not.toBeNull();
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:tweaks', tweaks: [{ ...tweak, from: 3 }] })).toBeNull();
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:details', request: 1, nodes: [{ id: 1, text: 'Main', html: '<body></body>' }] })).not.toBeNull();
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:details', request: 1, nodes: [{ id: 1, text: 'Main', html: 'x'.repeat(2001) }] })).toBeNull();
});

test('committed selections ask their board for details and keep the latest answer', () => {
  select();
  const describe = sent.filter((message) => message.action === 'describe').at(-1);
  expect(describe).toMatchObject({ ids: [1] });
  report('details', { request: describe.request, nodes: [{ id: 1, text: 'Main', html: '<body></body>' }] });
  expect(inspector.details['a:1']).toEqual({ id: 1, text: 'Main', html: '<body></body>' });
  const count = sent.filter((message) => message.action === 'describe').length;
  snapshot();
  act(() => inspector.selectArea(area(0, 0, 100, 100), false, true));
  expect(sent.filter((message) => message.action === 'describe')).toHaveLength(count);
  act(() => inspector.selectArea(area(0, 0, 100, 100), false));
  const next = sent.filter((message) => message.action === 'describe').at(-1);
  expect(next).toMatchObject({ ids: [2] });
  report('details', { request: describe.request, nodes: [{ id: 2, text: 'stale', html: '' }] });
  expect(inspector.details['a:2']).toBeUndefined();
});

test('revision moves on human selection and tweak changes only', () => {
  report('tree', { nodes, truncated: false });
  const start = inspector.revision;
  select();
  const selected = inspector.revision;
  expect(selected).toBeGreaterThan(start);
  report('selection', { reason: 'update', selection: inspector.selection!.node });
  report('tree', { nodes, truncated: false });
  expect(inspector.revision).toBe(selected);
  act(() => inspector.change('gap', '24px'));
  const tweaked = inspector.revision;
  expect(tweaked).toBeGreaterThan(selected);
  snapshot();
  act(() => inspector.selectArea(area(0, 0, 100, 100), false, true));
  expect(inspector.revision).toBe(tweaked);
  act(() => inspector.selectArea(area(0, 0, 100, 100), false));
  expect(inspector.revision).toBeGreaterThan(tweaked);
  const committed = inspector.revision;
  act(() => inspector.clearSelection());
  expect(inspector.revision).toBeGreaterThan(committed);
});
