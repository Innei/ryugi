// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { INSPECTOR_PROPERTIES, type InspectorNode } from '../src/shared/inspector';
import { useInspector } from '../src/viewer/hooks/useInspector';
import { readInspectorReport } from '../src/viewer/lib/inspector';

const nodes: InspectorNode[] = [{ id: 1, parentId: null, children: [], name: 'Main', tag: 'body', kind: 'Frame', selector: 'body' }];
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
  report('tweaks', { tweaks: [{ id: 1, name: 'Main', property: 'gap', value: '24px' }] });
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
  report('tweaks', { tweaks: [{ id: 1, name: 'Main', property: 'gap', value: '24px' }] });
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
  expect(readInspectorReport({ ...header, type: 'ryugi:inspect:tree', truncated: false, nodes })).not.toBeNull();
});
