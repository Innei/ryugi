// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';

import { useBoardOrigin } from '../src/viewer/hooks/useBoardOrigin';
import {
  BOARD_SANDBOX_OPAQUE,
  BOARD_SANDBOX_SAME_SITE,
  boardOrigin,
} from '../src/viewer/lib/board-origin';

const local = { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:4100' };

test('uses the board port on the hostname the canvas was opened with', () => {
  expect(
    boardOrigin({
      location: local,
      contentBase: '/c/token/artboard/ideas/',
      boardPort: 4101,
      boardPath: '/c/artboard/AbC/',
      reachable: true,
    }),
  ).toEqual({
    base: 'http://localhost:4101/c/artboard/AbC/',
    sandbox: BOARD_SANDBOX_SAME_SITE,
    mode: 'same-site',
  });
  expect(
    boardOrigin({
      location: { ...local, hostname: '127.0.0.1', origin: 'http://127.0.0.1:4100' },
      contentBase: '/c/token/artboard/ideas/',
      boardPort: 4101,
      boardPath: '/c/artboard/AbC/',
      reachable: true,
    }).base,
  ).toBe('http://127.0.0.1:4101/c/artboard/AbC/');
});

test('brackets an IPv6 hostname', () => {
  expect(
    boardOrigin({
      location: { protocol: 'http:', hostname: '::1', origin: 'http://[::1]:4100' },
      contentBase: '/c/t/',
      boardPort: 4101,
      boardPath: '/c/artboard/AbC/',
      reachable: true,
    }).base,
  ).toBe('http://[::1]:4101/c/artboard/AbC/');
});

test('falls back to the main port with an opaque sandbox when the board port is missing or unreachable', () => {
  const fallback = {
    base: '/c/token/artboard/ideas/',
    sandbox: BOARD_SANDBOX_OPAQUE,
    mode: 'opaque',
  };
  expect(boardOrigin({ location: local, contentBase: '/c/token/artboard/ideas/' })).toEqual(
    fallback,
  );
  expect(
    boardOrigin({
      location: local,
      contentBase: '/c/token/artboard/ideas/',
      boardPort: 4101,
      boardPath: '/c/artboard/AbC/',
      reachable: false,
    }),
  ).toEqual(fallback);
});

test('an absolute content base on another origin is already same-site content', () => {
  expect(
    boardOrigin({
      location: {
        protocol: 'https:',
        hostname: 'ryugi.innei.dev',
        origin: 'https://ryugi.innei.dev',
      },
      contentBase: 'https://ryugi-content.innei.dev/a/1/grant/',
    }),
  ).toEqual({
    base: 'https://ryugi-content.innei.dev/a/1/grant/',
    sandbox: BOARD_SANDBOX_SAME_SITE,
    mode: 'same-site',
  });
});

test('content on the page origin itself stays opaque', () => {
  expect(
    boardOrigin({
      location: {
        protocol: 'https:',
        hostname: 'ryugi.innei.dev',
        origin: 'https://ryugi.innei.dev',
      },
      contentBase: 'https://ryugi.innei.dev/c/x/',
    }).sandbox,
  ).toBe(BOARD_SANDBOX_OPAQUE);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

test('the hook probes the board port and reports nothing until the probe settles', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let settle!: (ok: boolean) => void;
  const fetch = vi.fn(
    () =>
      new Promise((resolve, reject) => {
        settle = (ok) => (ok ? resolve(new Response('')) : reject(new TypeError('refused')));
      }),
  );
  vi.stubGlobal('fetch', fetch);
  let result: ReturnType<typeof useBoardOrigin> = null;
  function Harness() {
    result = useBoardOrigin({
      contentBase: '/c/t/artboard/ideas/',
      boardPort: 4101,
      boardPath: '/c/artboard/AbC/',
    });
    return null;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(createElement(Harness)));
  expect(result).toBeNull();
  expect(fetch).toHaveBeenCalledWith(
    `http://${location.hostname}:4101/robots.txt`,
    expect.objectContaining({ mode: 'no-cors' }),
  );
  await act(async () => settle(false));
  expect(result!.mode).toBe('opaque');
  act(() => root.unmount());
});
