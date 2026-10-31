import { expect, test } from 'vitest';

import {
  accessPolicy,
  hostAllowed,
  isLoopbackHost,
  navigationAllowed,
  originAllowed,
} from '../src/server/access';

const loopback = accessPolicy({
  host: '127.0.0.1',
  urlHost: 'localhost',
  ports: [4100, 4101],
  cloudOrigin: 'https://ryugi.innei.dev',
});

test('recognises loopback bind addresses', () => {
  expect(isLoopbackHost('127.0.0.1')).toBe(true);
  expect(isLoopbackHost('localhost')).toBe(true);
  expect(isLoopbackHost('::1')).toBe(true);
  expect(isLoopbackHost('0.0.0.0')).toBe(false);
  expect(isLoopbackHost('192.168.1.4')).toBe(false);
});

test('accepts the loopback hosts on the server ports only', () => {
  expect(hostAllowed(loopback, 'localhost:4100')).toBe(true);
  expect(hostAllowed(loopback, '127.0.0.1:4101')).toBe(true);
  expect(hostAllowed(loopback, 'evil.test:4100')).toBe(false);
  expect(hostAllowed(loopback, 'localhost:9999')).toBe(false);
  expect(hostAllowed(loopback, undefined)).toBe(false);
});

test('accepts a configured url host and bracketed IPv6', () => {
  const policy = accessPolicy({ host: '::1', urlHost: '::1', ports: [4100] });
  expect(hostAllowed(policy, '[::1]:4100')).toBe(true);
  const named = accessPolicy({ host: '127.0.0.1', urlHost: 'dev.local', ports: [4100] });
  expect(hostAllowed(named, 'dev.local:4100')).toBe(true);
});

test('a non-loopback server leaves hosts to the key', () => {
  const remote = accessPolicy({ host: '0.0.0.0', urlHost: 'box', ports: [4100] });
  expect(remote.loopback).toBe(false);
  expect(hostAllowed(remote, 'anything:4100')).toBe(true);
});

test('origins: none passes, local passes, cloud only where allowed, others fail', () => {
  expect(originAllowed(loopback, undefined)).toBe(true);
  expect(originAllowed(loopback, 'http://localhost:4100')).toBe(true);
  expect(originAllowed(loopback, 'http://127.0.0.1:4100')).toBe(true);
  expect(originAllowed(loopback, 'http://127.0.0.1:4101')).toBe(false);
  expect(originAllowed(loopback, 'https://evil.test')).toBe(false);
  expect(originAllowed(loopback, 'null')).toBe(false);
  expect(originAllowed(loopback, 'https://ryugi.innei.dev')).toBe(false);
  expect(originAllowed(loopback, 'https://ryugi.innei.dev', { cloud: true })).toBe(true);
});

test('navigation: only direct or same-origin loads', () => {
  expect(navigationAllowed(undefined)).toBe(true);
  expect(navigationAllowed('none')).toBe(true);
  expect(navigationAllowed('same-origin')).toBe(true);
  expect(navigationAllowed('same-site')).toBe(false);
  expect(navigationAllowed('cross-site')).toBe(false);
});
