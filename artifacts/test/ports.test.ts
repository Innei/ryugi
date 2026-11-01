import http from 'node:http';

import { afterEach, expect, test } from 'vitest';

import { BOARD_PORTS, listenFirst, MAIN_PORTS, portList } from '../src/server/ports';

const servers: http.Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});
const newServer = () => {
  const server = http.createServer();
  servers.push(server);
  return server;
};
const occupy = async () => {
  const server = newServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as { port: number }).port;
};

test('the default ports are high and fixed', () => {
  expect(MAIN_PORTS).toEqual([27319, 27320, 27321]);
  expect(BOARD_PORTS).toEqual([27329, 27330, 27331]);
  expect(portList({}, 'main')).toEqual(MAIN_PORTS);
  expect(portList({}, 'board')).toEqual(BOARD_PORTS);
});

test('the port lists can be overridden for tests and odd machines', () => {
  expect(portList({ RYUGI_ARTIFACTS_PORTS: '4100, 4101' }, 'main')).toEqual([4100, 4101]);
  expect(portList({ RYUGI_ARTIFACTS_BOARD_PORTS: '0' }, 'board')).toEqual([0]);
  expect(portList({ RYUGI_ARTIFACTS_PORTS: 'nope' }, 'main')).toEqual(MAIN_PORTS);
});

test('listenFirst skips an occupied port and binds the next one', async () => {
  const taken = await occupy();
  const free = await occupy();
  await new Promise((resolve) => servers.pop()!.close(resolve));
  const port = await listenFirst(newServer(), '127.0.0.1', [taken, free]);
  expect(port).toBe(free);
});

test('listenFirst explains --port when every port is taken', async () => {
  const a = await occupy();
  const b = await occupy();
  await expect(listenFirst(newServer(), '127.0.0.1', [a, b])).rejects.toThrow(/--port/);
});

test('port 0 binds an ephemeral port', async () => {
  expect(await listenFirst(newServer(), '127.0.0.1', [0])).toBeGreaterThan(0);
});
