import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { CliError } from '../src/cli/paths';
import { detectInstall, installCommand, update } from '../src/cli/update';
import { readLatest } from '../src/cli/update-hint';

const PKG = 'node_modules/ryugi-artifacts/dist/cli.cjs';
const servers: http.Server[] = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

test.each([
  [`/opt/homebrew/lib/${PKG}`, { kind: 'global', pm: 'npm' }],
  [`/Users/me/.nvm/versions/node/v24.1.0/lib/${PKG}`, { kind: 'global', pm: 'npm' }],
  [
    `C:\\Users\\Me\\AppData\\Roaming\\npm\\${PKG.replace(/\//g, '\\')}`,
    { kind: 'global', pm: 'npm' },
  ],
  [
    `/Users/me/Library/pnpm/global/5/node_modules/.pnpm/ryugi-artifacts@1.42.2/${PKG}`,
    { kind: 'global', pm: 'pnpm' },
  ],
  [`/home/me/.local/share/pnpm/global/5/${PKG}`, { kind: 'global', pm: 'pnpm' }],
  [`/home/me/.config/yarn/global/${PKG}`, { kind: 'global', pm: 'yarn' }],
  [`/home/me/.bun/install/global/${PKG}`, { kind: 'global', pm: 'bun' }],
  [`/Users/me/.npm/_npx/0123abcd/${PKG}`, { kind: 'transient', runner: 'npx' }],
  [
    `/Users/me/Library/Caches/pnpm/dlx/abc/node_modules/.pnpm/ryugi-artifacts@1.42.2/${PKG}`,
    { kind: 'transient', runner: 'pnpm dlx' },
  ],
  [`/private/tmp/bunx-501-ryugi-artifacts@latest/${PKG}`, { kind: 'transient', runner: 'bunx' }],
  ['/Users/me/git/ryugi/skills/artifacts/app/cli.cjs', { kind: 'local' }],
  ['/Users/me/git/ryugi/artifacts/dist/cli.cjs', { kind: 'local' }],
  [`/srv/app/${PKG}`, { kind: 'unknown' }],
])('detects %s', (file, expected) => {
  expect(detectInstall(file, {})).toEqual(expected);
});

test('the skill launcher wins over the install path', () => {
  expect(
    detectInstall(`/opt/homebrew/lib/${PKG}`, { RYUGI_ARTIFACTS_COMMAND: 'node launcher.cjs' }),
  ).toEqual({ kind: 'launcher' });
});

test.each([
  ['npm', ['install', '-g', 'ryugi-artifacts@1.43.0']],
  ['pnpm', ['add', '-g', 'ryugi-artifacts@1.43.0']],
  ['yarn', ['global', 'add', 'ryugi-artifacts@1.43.0']],
  ['bun', ['add', '-g', 'ryugi-artifacts@1.43.0']],
] as const)('installs with %s', (pm, args) => {
  expect(installCommand(pm, '1.43.0')).toEqual({ cmd: pm, args });
});

async function registry(version: string) {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(req.url === '/ryugi-artifacts/latest' ? { version } : {}));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

function fakePm(name: string, exit = 0) {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-update-bin-'));
  const log = path.join(bin, 'calls');
  fs.writeFileSync(
    path.join(bin, name),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\nexit ${exit}\n`,
    { mode: 0o755 },
  );
  return {
    log,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      XDG_CACHE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-update-cache-')),
    },
  };
}

async function run(options: Partial<Parameters<typeof update>[0]>) {
  const events: Record<string, unknown>[] = [];
  const env = {
    XDG_CACHE_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'ryugi-update-cache-')),
    ...options.env,
  };
  const code = await update(
    {
      current: '1.42.2',
      file: `/opt/homebrew/lib/${PKG}`,
      registry: await registry('1.43.0'),
      check: false,
      ...options,
      env,
    },
    (value) => events.push(value),
  );
  return { code, events };
}

test.skipIf(process.platform === 'win32')(
  'installs the latest release with the detected package manager and refreshes the cache',
  async () => {
    const pm = fakePm('pnpm');
    const { code, events } = await run({
      file: `/Users/me/Library/pnpm/global/5/${PKG}`,
      env: pm.env,
    });
    expect(code).toBe(0);
    expect(fs.readFileSync(pm.log, 'utf8').trim()).toBe('add -g ryugi-artifacts@1.43.0');
    expect(events).toEqual([
      {
        type: 'updated',
        from: '1.42.2',
        to: '1.43.0',
        pm: 'pnpm',
        command: 'pnpm add -g ryugi-artifacts@1.43.0',
      },
    ]);
    expect(
      readLatest(path.join(pm.env.XDG_CACHE_HOME, 'ryugi', 'artifacts', 'latest.json'))?.version,
    ).toBe('1.43.0');
  },
);

test.skipIf(process.platform === 'win32')('--pm overrides detection', async () => {
  const pm = fakePm('bun');
  const { events } = await run({ file: `/srv/app/${PKG}`, env: pm.env, pm: 'bun' });
  expect(fs.readFileSync(pm.log, 'utf8').trim()).toBe('add -g ryugi-artifacts@1.43.0');
  expect(events[0]).toMatchObject({ type: 'updated', pm: 'bun' });
});

test.skipIf(process.platform === 'win32')(
  '--check and an up-to-date install never run the package manager',
  async () => {
    const pm = fakePm('npm');
    const checked = await run({ env: pm.env, check: true });
    expect(checked.events).toEqual([
      {
        type: 'update-check',
        current: '1.42.2',
        latest: '1.43.0',
        upToDate: false,
        install: 'global',
        command: 'npm install -g ryugi-artifacts@1.43.0',
      },
    ]);
    const current = await run({ env: pm.env, current: '1.43.0' });
    expect(current.events).toEqual([
      {
        type: 'update-check',
        current: '1.43.0',
        latest: '1.43.0',
        upToDate: true,
        install: 'global',
        command: null,
      },
    ]);
    expect(fs.existsSync(pm.log)).toBe(false);
  },
);

test.each([
  [`/Users/me/.npm/_npx/0123abcd/${PKG}`, {}, 'npx ryugi-artifacts@latest'],
  ['/Users/me/git/ryugi/artifacts/dist/cli.cjs', {}, 'git pull'],
  [`/opt/homebrew/lib/${PKG}`, { RYUGI_ARTIFACTS_COMMAND: 'node launcher.cjs' }, 'within a day'],
])('does not install for %s and says how to update instead', async (file, env, advice) => {
  const { code, events } = await run({ file, env });
  expect(code).toBe(0);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: 'update-check', upToDate: false, command: null });
  expect(events[0]!.message).toContain(advice);
});

test('an unknown install fails with every manual command', async () => {
  await expect(run({ file: `/srv/app/${PKG}` })).rejects.toThrow(CliError);
  await expect(run({ file: `/srv/app/${PKG}` })).rejects.toThrow(
    /npm install -g ryugi-artifacts@1\.43\.0[\s\S]*pnpm add -g/,
  );
});

test.skipIf(process.platform === 'win32')(
  'a failing package manager fails the command',
  async () => {
    const pm = fakePm('npm', 3);
    await expect(run({ env: pm.env })).rejects.toThrow(
      /npm install -g ryugi-artifacts@1\.43\.0 exited with 3/,
    );
  },
);
