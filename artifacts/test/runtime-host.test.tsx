// @vitest-environment happy-dom
import { act, createContext, type ReactNode, useContext, useEffect } from 'react';
import * as client from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { createHostRoot } from '../src/runtime/host';

vi.mock('react-dom/client', { spy: true });

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.mocked(client.createRoot).mockClear();
});

const Theme = createContext('none');

function host(tag = 'ryugi-test') {
  const el = document.createElement(tag);
  document.body.append(el);
  return el;
}

describe('single React root for every runtime element', () => {
  test('renders many elements through one root', async () => {
    const root = createHostRoot({ wrap: (children) => children, onError: () => {} });
    const els = [host(), host(), host()];
    await act(async () => {
      els.forEach((el, i) => root.register(el, () => <b>item {i}</b>));
    });
    expect(client.createRoot).toHaveBeenCalledTimes(1);
    expect(els.map((el) => el.innerHTML)).toEqual(['<b>item 0</b>', '<b>item 1</b>', '<b>item 2</b>']);
  });

  test('wraps every element in one shared provider', async () => {
    let mounts = 0;
    function Provider({ children }: { children: ReactNode }) {
      useEffect(() => {
        mounts++;
      }, []);
      return <Theme.Provider value="dark">{children}</Theme.Provider>;
    }
    function Themed() {
      return <i>{useContext(Theme)}</i>;
    }
    const root = createHostRoot({ wrap: (children) => <Provider>{children}</Provider>, onError: () => {} });
    const a = host();
    const b = host();
    await act(async () => {
      root.register(a, () => <Themed />);
      root.register(b, () => <Themed />);
    });
    expect([a.textContent, b.textContent]).toEqual(['dark', 'dark']);
    expect(mounts).toBe(1);
  });

  test('an update re-renders only that element', async () => {
    const root = createHostRoot({ wrap: (children) => children, onError: () => {} });
    const renders = { a: 0, b: 0 };
    let label = 'one';
    const a = host();
    const b = host();
    await act(async () => {
      root.register(a, () => (renders.a++, <span>{label}</span>));
      root.register(b, () => (renders.b++, <span>static</span>));
    });
    const before = { ...renders };
    label = 'two';
    await act(async () => root.update(a));
    expect(a.textContent).toBe('two');
    expect(renders.a).toBeGreaterThan(before.a);
    expect(renders.b).toBe(before.b);
  });

  test('the root container lives in the document so popups rendered beside it are visible', async () => {
    createHostRoot({ wrap: (children) => children, onError: () => {} });
    const container = vi.mocked(client.createRoot).mock.calls[0]![0] as HTMLElement;
    expect(container.isConnected).toBe(true);
  });

  test('unregistering clears the element', async () => {
    const root = createHostRoot({ wrap: (children) => children, onError: () => {} });
    const el = host();
    await act(async () => root.register(el, () => <span>here</span>));
    await act(async () => root.unregister(el));
    expect(el.innerHTML).toBe('');
  });

  test('events inside an element reach its React handlers', async () => {
    const root = createHostRoot({ wrap: (children) => children, onError: () => {} });
    const clicked = vi.fn();
    const el = host();
    await act(async () => root.register(el, () => <button onClick={clicked}>go</button>));
    await act(async () => el.querySelector('button')!.click());
    expect(clicked).toHaveBeenCalledTimes(1);
  });
});

describe('errors stay inside the element that threw', () => {
  test('a crashing element reports the error and leaves the others rendered', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const errors: unknown[] = [];
    const root = createHostRoot({ wrap: (children) => children, onError: (error) => errors.push(error) });
    function Boom(): ReactNode {
      throw new Error('boom');
    }
    const bad = host();
    const good = host();
    await act(async () => {
      root.register(bad, () => <Boom />);
      root.register(good, () => <span>fine</span>);
    });
    expect(good.textContent).toBe('fine');
    expect(bad.innerHTML).toBe('');
    expect(errors).toEqual([expect.objectContaining({ message: 'boom' })]);
  });

  test('a crashed element renders again after it is updated', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const root = createHostRoot({ wrap: (children) => children, onError: () => {} });
    let broken = true;
    function Maybe() {
      if (broken) throw new Error('boom');
      return <span>recovered</span>;
    }
    const el = host();
    await act(async () => root.register(el, () => <Maybe />));
    broken = false;
    await act(async () => root.update(el));
    expect(el.textContent).toBe('recovered');
  });
});
