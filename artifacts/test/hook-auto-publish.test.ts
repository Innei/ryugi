import { execFile, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { credentialsFile } from '../src/server/credentials';
import { settingsFileFor, writeGlobalAutoPublish } from '../src/server/settings';
import { closeAll, start } from './fake-cloud';
import { writeHtml } from './helpers';

afterEach(closeAll);

const hook = createRequire(import.meta.url)(
  path.resolve(__dirname, '../../hooks/selection-context.cjs'),
) as {
  credentialsPath: (
    env: Record<string, string | undefined>,
    platform: string,
    home: string,
  ) => string;
  autoPublishContext: (
    project: string,
    env: Record<string, string | undefined>,
    sessionId: string,
  ) => string;
};

function setup({ signedIn = true, decided }: { signedIn?: boolean; decided?: boolean } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-hook-home-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-hook-project-'));
  const env = { XDG_CONFIG_HOME: home };
  const credentials = credentialsFile(env, process.platform, os.homedir());
  if (signedIn) {
    fs.mkdirSync(path.dirname(credentials), { recursive: true });
    fs.writeFileSync(
      credentials,
      JSON.stringify({ origin: 'https://ryugi.innei.dev', token: 't', login: 'innei' }),
    );
  }
  if (decided !== undefined) writeGlobalAutoPublish(settingsFileFor(credentials), decided);
  const state = path.join(project, '.ryugi', 'artifacts', '.state');
  fs.mkdirSync(state, { recursive: true });
  return { project, env, state };
}

test('the hook finds the credentials where the server keeps them', () => {
  for (const [env, platform] of [
    [{ XDG_CONFIG_HOME: '/x' }, 'linux'],
    [{}, 'darwin'],
    [{ APPDATA: 'C:\\A' }, 'win32'],
  ] as const) {
    expect(hook.credentialsPath(env, platform, '/home/u')).toBe(
      credentialsFile(env, platform, '/home/u'),
    );
  }
});

describe('asking once', () => {
  test('asks a signed-in partner who has not decided, once per session', () => {
    const { project, env } = setup();
    const text = hook.autoPublishContext(project, env, 's1');
    expect(text).toContain('auto-publish');
    expect(text).toContain('config --auto-publish on');
    expect(hook.autoPublishContext(project, env, 's1')).toBe('');
    expect(hook.autoPublishContext(project, env, 's2')).toContain('config --auto-publish on');
  });

  test('stays quiet when signed out or already decided', () => {
    for (const options of [{ signedIn: false }, { decided: true }, { decided: false }]) {
      const { project, env } = setup(options);
      expect(hook.autoPublishContext(project, env, 's1')).toBe('');
    }
  });
});

describe('notices', () => {
  test('tells the agent about each notice once', () => {
    const { project, env, state } = setup({ decided: true });
    fs.writeFileSync(
      path.join(state, 'auto-publish.json'),
      JSON.stringify({
        dirty: [],
        paused: { token: 't' },
        notice: { id: 'n1', kind: 'signed-out', message: 'x' },
      }),
    );
    const first = hook.autoPublishContext(project, env, 's1');
    expect(first).toContain('sign-in expired');
    expect(first).toContain('publish --login');
    expect(hook.autoPublishContext(project, env, 's1')).toBe('');
    fs.writeFileSync(
      path.join(state, 'auto-publish.json'),
      JSON.stringify({
        dirty: [],
        paused: null,
        notice: { id: 'n2', kind: 'cap', message: 'limit of 100 published artifacts reached' },
      }),
    );
    const second = hook.autoPublishContext(project, env, 's1');
    expect(second).toContain('limit of 100 published artifacts reached');
    expect(second).toContain('publish --list');
    expect(second).not.toContain('ryugi.innei.dev');
  });
});

describe('plan limit notice', () => {
  test('passes the upgrade link on to the agent', () => {
    const { project, env, state } = setup({ decided: true });
    fs.writeFileSync(
      path.join(state, 'auto-publish.json'),
      JSON.stringify({
        dirty: [],
        paused: null,
        notice: {
          id: 'n4',
          kind: 'cap',
          message: 'The free plan allows 5 private artifacts and you have 5.',
          upgradeUrl: 'https://cloud.example/billing',
        },
      }),
    );
    const text = hook.autoPublishContext(project, env, 's1');
    expect(text).toContain('free plan allows 5 private');
    expect(text).toContain('https://cloud.example/billing');
  });
});

describe('failing notice', () => {
  test('tells the agent which artifact keeps failing to publish', () => {
    const { project, env, state } = setup({ decided: true });
    fs.writeFileSync(
      path.join(state, 'auto-publish.json'),
      JSON.stringify({
        dirty: ['html/a'],
        paused: null,
        notice: { id: 'n3', kind: 'failing', message: 'html/a: cloud answered 500' },
      }),
    );
    const text = hook.autoPublishContext(project, env, 's1');
    expect(text).toContain('html/a: cloud answered 500');
    expect(text).toContain('could not publish');
  });
});

describe('turn-end flush hook', () => {
  test(
    'asks the running server to publish what changed and returns',
    { timeout: 15000 },
    async () => {
      const started = await start();
      writeGlobalAutoPublish(settingsFileFor(started.credentialsFile), true);
      writeHtml(started.root, 'a', { 'index.html': '<title>A</title>' });
      const stateFile = path.join(started.root, '.state', 'auto-publish.json');
      const until = Date.now() + 5000;
      while (!(fs.existsSync(stateFile) && fs.readFileSync(stateFile, 'utf8').includes('html/a'))) {
        if (Date.now() > until) throw new Error('never marked');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-hook-flush-'));
      fs.mkdirSync(path.join(project, '.ryugi', 'artifacts', '.state'), { recursive: true });
      fs.copyFileSync(
        path.join(started.root, '.state', 'server-info'),
        path.join(project, '.ryugi', 'artifacts', '.state', 'server-info'),
      );
      const run = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
        const child = execFile(
          process.execPath,
          [path.resolve(__dirname, '../../hooks/flush-artifacts.cjs'), project],
          { encoding: 'utf8', timeout: 5000 },
          (_err, stdout) => resolve({ code: child.exitCode, stdout }),
        );
      });
      expect(run.code).toBe(0);
      expect(run.stdout).toBe('');
      const deadline = Date.now() + 5000;
      while (!started.cloud.requests.some((r) => r.path.endsWith('/versions'))) {
        if (Date.now() > deadline) throw new Error('never published');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
  );

  test('does nothing without a running server', () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-hook-none-'));
    const run = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '../../hooks/flush-artifacts.cjs'), project],
      { encoding: 'utf8', timeout: 5000 },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toBe('');
    expect(run.stderr).toBe('');
  });
});
