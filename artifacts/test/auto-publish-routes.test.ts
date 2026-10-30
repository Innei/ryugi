import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  readGlobalAutoPublish,
  settingsFileFor,
  writeGlobalAutoPublish,
} from '../src/server/settings';
import { call, closeAll, config, start } from './fake-cloud';
import { writeHtml } from './helpers';

afterEach(closeAll);

const projectName = (root: string) => path.basename(path.resolve(root, '../..'));

describe('project name', () => {
  test('is sent when the cloud copy is created and with every version', async () => {
    const { server, root, cloud } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await call(server, 'POST', '/api/cloud/publish/html/a');
    const create = cloud.requests.find((r) => r.method === 'POST' && r.path === '/api/artifacts')!;
    expect(create.json.project).toBe(projectName(root));
    const versions = cloud.requests.filter((r) => r.path === '/api/artifacts/cloud1/versions');
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) expect(version.json.project).toBe(projectName(root));
  });
});

describe('unpublish opts out of auto-publish', () => {
  test('deleting by cloud id marks the local artifact', async () => {
    const { server, root, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await call(server, 'POST', '/api/cloud/publish/html/a');
    await call(server, 'DELETE', '/api/cloud/artifacts/cloud1');
    expect(config(configFile).artifacts['html/a'].autoPublish).toBe(false);
  });

  test('a manual publish opts it back in', async () => {
    const { server, root, configFile } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await call(server, 'POST', '/api/cloud/publish/html/a');
    await call(server, 'DELETE', '/api/cloud/publish/html/a');
    await call(server, 'POST', '/api/cloud/publish/html/a');
    expect(config(configFile).artifacts['html/a'].autoPublish).toBeUndefined();
  });
});

describe('sign-in default', () => {
  const signIn = async (server: Awaited<ReturnType<typeof start>>['server']) => {
    const state = new URL(
      String((await call(server, 'POST', '/api/cloud/login')).json.url),
    ).searchParams.get('state');
    const res = await fetch(
      `http://127.0.0.1:${server.port}/api/cloud/callback?state=${state}&code=one-time`,
    );
    return res.text();
  };

  const ticketOf = (page: string) => /name="ticket" value="([^"]+)"/.exec(page)?.[1];

  const answer = (server: Awaited<ReturnType<typeof start>>['server'], form: string) =>
    fetch(`http://127.0.0.1:${server.port}/api/cloud/callback/auto-publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });

  test('a sign-in turns auto-publish on when undecided and says so', async () => {
    const { server, credentialsFile } = await start({ signedIn: false });
    const page = await signIn(server);
    expect(readGlobalAutoPublish(settingsFileFor(credentialsFile))).toBe(true);
    expect(page).toContain('Auto-publish is on');
    expect(page).toContain('Settings');
    expect(page).not.toContain('ryugi-artifacts config');
  });

  test('a sign-in keeps an earlier "off" and offers to turn it on', async () => {
    const { server, credentialsFile } = await start({ signedIn: false });
    writeGlobalAutoPublish(settingsFileFor(credentialsFile), false);
    const page = await signIn(server);
    expect(readGlobalAutoPublish(settingsFileFor(credentialsFile))).toBe(false);
    expect(page).toContain('Auto-publish is off');
    expect(page).toContain('name="value" value="on"');
  });

  test('the sign-in page switch turns auto-publish off and back on', async () => {
    const { server, credentialsFile } = await start({ signedIn: false });
    const ticket = ticketOf(await signIn(server))!;
    const off = await answer(server, `ticket=${ticket}&value=off`);
    expect(off.status).toBe(200);
    expect(await off.text()).toContain('Auto-publish is off');
    expect(readGlobalAutoPublish(settingsFileFor(credentialsFile))).toBe(false);
    await answer(server, `ticket=${ticket}&value=on`);
    expect(readGlobalAutoPublish(settingsFileFor(credentialsFile))).toBe(true);
  });

  test('the switch needs the ticket from that sign-in', async () => {
    const { server, credentialsFile } = await start({ signedIn: false });
    await signIn(server);
    const res = await answer(server, 'ticket=forged&value=off');
    expect(res.status).toBe(403);
    expect(readGlobalAutoPublish(settingsFileFor(credentialsFile))).toBe(true);
  });
});

describe('auto-publish setting route', () => {
  test('status reports the global, project and effective values', async () => {
    const { server } = await start();
    expect((await call(server, 'GET', '/api/cloud/status')).json.autoPublish).toEqual({
      global: null,
      project: null,
      enabled: false,
      postponed: false,
    });
  });

  test('"Not now" postpones the question for this run only', async () => {
    const { server, credentialsFile } = await start();
    const later = await call(server, 'POST', '/api/cloud/auto-publish/later');
    expect(later.status).toBe(200);
    expect((await call(server, 'GET', '/api/cloud/status')).json.autoPublish).toMatchObject({
      global: null,
      postponed: true,
    });
    const next = await start({ credentialsFile });
    expect((await call(next.server, 'GET', '/api/cloud/status')).json.autoPublish).toMatchObject({
      global: null,
      postponed: false,
    });
  });

  test('a second "Not now" turns auto-publish off', async () => {
    const { server, credentialsFile } = await start();
    await call(server, 'POST', '/api/cloud/auto-publish/later');
    const next = await start({ credentialsFile });
    await call(next.server, 'POST', '/api/cloud/auto-publish/later');
    expect(readGlobalAutoPublish(settingsFileFor(credentialsFile))).toBe(false);
  });

  test('sets the global value', async () => {
    const { server, credentialsFile } = await start();
    const { status, json } = await call(server, 'POST', '/api/cloud/auto-publish', {
      scope: 'global',
      value: true,
    });
    expect(status).toBe(200);
    expect(json).toEqual({ global: true, project: null, enabled: true });
    expect(readGlobalAutoPublish(settingsFileFor(credentialsFile))).toBe(true);
  });

  test('sets and clears the project value', async () => {
    const { server, configFile } = await start();
    await call(server, 'POST', '/api/cloud/auto-publish', { scope: 'global', value: true });
    expect(
      (await call(server, 'POST', '/api/cloud/auto-publish', { scope: 'project', value: false }))
        .json,
    ).toEqual({ global: true, project: false, enabled: false });
    expect(config(configFile).autoPublish).toBe(false);
    expect(
      (await call(server, 'POST', '/api/cloud/auto-publish', { scope: 'project', value: null }))
        .json,
    ).toEqual({ global: true, project: null, enabled: true });
  });

  test('is off while signed out even when set', async () => {
    const { server } = await start({ signedIn: false });
    expect(
      (await call(server, 'POST', '/api/cloud/auto-publish', { scope: 'global', value: true }))
        .json,
    ).toEqual({ global: true, project: null, enabled: false });
  });

  test('rejects a bad body', async () => {
    const { server } = await start();
    expect(
      (await call(server, 'POST', '/api/cloud/auto-publish', { scope: 'global', value: 'yes' }))
        .status,
    ).toBe(400);
    expect(
      (await call(server, 'POST', '/api/cloud/auto-publish', { scope: 'global', value: null }))
        .status,
    ).toBe(400);
    expect(
      (await call(server, 'POST', '/api/cloud/auto-publish', { scope: 'team', value: true }))
        .status,
    ).toBe(400);
  });

  test('needs the key or the same origin', async () => {
    const { server, credentialsFile } = await start();
    const res = await fetch(`http://127.0.0.1:${server.port}/api/cloud/auto-publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': 'https://evil.example' },
      body: '{"scope":"global","value":true}',
    });
    expect(res.status).toBe(403);
    expect(fs.existsSync(settingsFileFor(credentialsFile))).toBe(false);
  });
});
