import { runInNewContext } from 'node:vm';

import { expect, test } from 'vitest';

import { MAC_FOCUS_SCRIPT } from '../src/server/browser-focus';

const run = (apps: Record<string, unknown>, urls: string[]) =>
  runInNewContext(`${MAC_FOCUS_SCRIPT}\nrun(urls)`, {
    urls,
    Application: (id: string) => apps[id] ?? { running: () => false },
  });

test('focuses an existing Dia tab through either its cloud or local address without changing the URL', () => {
  const tab = { url: () => 'https://ryugi.innei.dev/a/report#ryugi-host=old' };
  let focused: unknown;
  let activated = false;
  const result = run(
    {
      'company.thebrowser.dia': {
        running: () => true,
        windows: () => [{ tabs: () => [{ url: () => 'https://example.com/' }, tab] }],
        focus: (value: unknown) => {
          focused = value;
        },
        activate: () => {
          activated = true;
        },
      },
    },
    ['https://ryugi.innei.dev/a/report', 'http://localhost:5000/document/abc?key=new'],
  );
  expect(result).toBe('found');
  expect(focused).toBe(tab);
  expect(activated).toBe(true);
  expect(tab.url()).toBe('https://ryugi.innei.dev/a/report#ryugi-host=old');
});

test('selects the matching Chrome tab and window, treating loopback hostnames and keys as aliases', () => {
  const window = {
    tabs: () => [
      { url: () => 'https://example.com/' },
      { url: () => 'http://127.0.0.1:5000/document/abc?key=old' },
    ],
    activeTabIndex: 1,
    index: 2,
  };
  const result = run(
    { 'com.google.Chrome': { running: () => true, windows: () => [window], activate() {} } },
    ['http://localhost:5000/document/abc?key=new'],
  );
  expect(result).toBe('found');
  expect(window.activeTabIndex).toBe(2);
  expect(window.index).toBe(1);
});

test('selects an existing Safari tab without navigating it', () => {
  const tab = { url: () => 'https://ryugi.innei.dev/a/report' };
  const window = { tabs: () => [tab], currentTab: null as unknown, index: 2 };
  const result = run(
    { 'com.apple.Safari': { running: () => true, windows: () => [window], activate() {} } },
    ['https://ryugi.innei.dev/a/report'],
  );
  expect(result).toBe('found');
  expect(window.currentTab).toBe(tab);
  expect(window.index).toBe(1);
});

test('an unrelated artifact in the same browser does not prevent a new tab', () => {
  const result = run(
    {
      'company.thebrowser.dia': {
        running: () => true,
        windows: () => [{ tabs: () => [{ url: () => 'https://ryugi.innei.dev/a/other' }] }],
      },
    },
    ['https://ryugi.innei.dev/a/report'],
  );
  expect(result).toBe('missing');
});

test('keeps an existing tab even if the browser refuses to focus it', () => {
  const result = run(
    {
      'company.thebrowser.dia': {
        running: () => true,
        windows: () => [{ tabs: () => [{ url: () => 'https://ryugi.innei.dev/a/report' }] }],
        focus() {
          throw new Error('Cannot focus');
        },
      },
    },
    ['https://ryugi.innei.dev/a/report'],
  );
  expect(result).toBe('found');
});

test('does not assume a tab is missing when its browser cannot be inspected', () => {
  const result = run(
    {
      'company.thebrowser.dia': {
        running: () => true,
        windows() {
          throw new Error('Not authorized');
        },
      },
    },
    ['https://ryugi.innei.dev/a/report'],
  );
  expect(result).toBe('unknown');
});
