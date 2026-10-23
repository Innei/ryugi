import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { readAutoPublishState } from '../src/server/auto-publish';
import { updateArtifactConfig } from '../src/server/config';
import { settingsFileFor, writeGlobalAutoPublish } from '../src/server/settings';
import { call, closeAll, config, requestLines, start } from './fake-cloud';
import { openWs, writeHtml } from './helpers';

afterEach(closeAll);

async function waitFor(check: () => boolean, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function startEnabled(options: { signedIn?: boolean } = {}) {
  const started = await start(options);
  writeGlobalAutoPublish(settingsFileFor(started.credentialsFile), true);
  const stateFile = path.join(started.root, '.state', 'auto-publish.json');
  const dirty = () => readAutoPublishState(stateFile).dirty;
  const edit = async (id: string, html: string) => {
    writeHtml(started.root, id, { 'index.html': html });
    await waitFor(() => dirty().includes(`html/${id}`));
  };
  const flush = () => call(started.server, 'POST', '/api/cloud/flush?wait=1');
  return { ...started, stateFile, dirty, edit, flush, state: () => readAutoPublishState(stateFile) };
}

describe('turn-end flush', () => {
  test('publishes an artifact changed after the server started as a private copy', async () => {
    const { cloud, configFile, edit, flush, dirty } = await startEnabled();
    await edit('a', '<title>A</title>');
    expect((await flush()).status).toBe(200);
    expect(cloud.requests[0]).toMatchObject({ method: 'POST', path: '/api/artifacts', json: { type: 'html', visibility: 'private' } });
    expect(config(configFile).artifacts['html/a'].cloud).toMatchObject({ id: 'cloud1', visibility: 'private' });
    expect(dirty()).toEqual([]);
  });

  test('a flush without a change publishes nothing, so old artifacts are not backfilled', async () => {
    const { root, cloud, credentialsFile, server } = await start();
    writeHtml(root, 'old', { 'index.html': '<title>Old</title>' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    writeGlobalAutoPublish(settingsFileFor(credentialsFile), true);
    await call(server, 'POST', '/api/cloud/flush?wait=1');
    expect(cloud.requests).toEqual([]);
  });

  test('changes made while undecided are not published later', async () => {
    const { root, cloud, credentialsFile, server } = await start();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    writeGlobalAutoPublish(settingsFileFor(credentialsFile), true);
    await call(server, 'POST', '/api/cloud/flush?wait=1');
    expect(cloud.requests).toEqual([]);
  });

  test('closing the server publishes what is still pending', async () => {
    const { cloud, configFile, edit, server, dirty } = await startEnabled();
    await edit('a', '<title>A</title>');
    await server.close();
    expect(cloud.requests.map((r) => `${r.method} ${r.path}`)).toContain('POST /api/artifacts');
    expect(config(configFile).artifacts['html/a'].cloud?.publishedAt).toBeTruthy();
    expect(dirty()).toEqual([]);
  });

  test('a later change republishes to the same link', async () => {
    const { cloud, edit, flush } = await startEnabled();
    await edit('a', '<title>A</title>');
    await flush();
    const before = cloud.requests.length;
    await edit('a', '<title>A2</title>');
    await flush();
    expect(requestLines(cloud, before)[0]).toBe('POST /api/artifacts/cloud1/versions');
    expect(requestLines(cloud, before)).not.toContain('POST /api/artifacts');
  });

  test('a change that leaves the content as published sends nothing', async () => {
    const { cloud, edit, flush, dirty } = await startEnabled();
    await edit('a', '<title>A</title>');
    await flush();
    const before = cloud.requests.length;
    await edit('a', '<title>A2</title>');
    await edit('a', '<title>A</title>');
    await flush();
    expect(requestLines(cloud, before)).toEqual([]);
    expect(dirty()).toEqual([]);
  });

  test('open local pages hear when an auto-publish reaches the cloud', async () => {
    const { server, edit, flush } = await startEnabled();
    const ws = await openWs(server.port, { Cookie: `ryugi_artifacts_${server.port}=${server.token}`, Origin: `http://127.0.0.1:${server.port}`, Host: `127.0.0.1:${server.port}` });
    await edit('a', '<title>A</title>');
    await flush();
    await waitFor(() => ws.messages.some((m) => JSON.parse(m).type === 'cloud-published'));
    expect(ws.messages.map((m) => JSON.parse(m)).filter((m) => m.type === 'cloud-published')).toEqual([{ type: 'cloud-published', artifact: 'html/a' }]);
    ws.socket?.destroy();
  });

  test('without the session key the flush route is refused', async () => {
    const { server } = await startEnabled();
    expect((await call(server, 'POST', '/api/cloud/flush', undefined, { key: false })).status).toBe(403);
  });

  test('without wait the route answers before publishing', async () => {
    const { server, edit, cloud } = await startEnabled();
    await edit('a', '<title>A</title>');
    expect((await call(server, 'POST', '/api/cloud/flush')).status).toBe(202);
    await waitFor(() => cloud.requests.some((r) => r.path.endsWith('/versions')));
  });
});

describe('what is skipped', () => {
  test('an artifact opted out by unpublish is not published and drops its mark', async () => {
    const { root, cloud, configFile, edit, flush, dirty } = await startEnabled();
    writeHtml(root, 'a', { 'index.html': '<title>A</title>' });
    updateArtifactConfig(configFile, 'html/a', { autoPublish: false });
    await edit('a', '<title>A2</title>');
    await flush();
    expect(cloud.requests).toEqual([]);
    expect(dirty()).toEqual([]);
  });

  test('an artifact with warnings stays dirty without uploading', async () => {
    const { root, cloud, flush, dirty } = await startEnabled();
    fs.mkdirSync(path.join(root, 'artboard', 'b'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artboard', 'b', 'canvas.json'), '{oops');
    await waitFor(() => dirty().includes('artboard/b'));
    await flush();
    expect(cloud.requests).toEqual([]);
    expect(dirty()).toEqual(['artboard/b']);
  });

  test('a public choice stored before the first publish is honored', async () => {
    const { configFile, cloud, edit, flush } = await startEnabled();
    updateArtifactConfig(configFile, 'html/a', { visibility: 'public' });
    await edit('a', '<title>A</title>');
    await flush();
    expect(cloud.requests[0]!.json.visibility).toBe('public');
  });

  test('deleting an artifact locally drops its mark and leaves the cloud copy', async () => {
    const { root, cloud, edit, flush, dirty } = await startEnabled();
    await edit('a', '<title>A</title>');
    await flush();
    await edit('a', '<title>A2</title>');
    fs.rmSync(path.join(root, 'html', 'a'), { recursive: true });
    await waitFor(() => !dirty().includes('html/a'));
    const before = cloud.requests.length;
    await flush();
    expect(cloud.requests.length).toBe(before);
  });
});

describe('failures', () => {
  test('an unreachable cloud keeps the mark for the next turn', async () => {
    const { cloud, edit, flush, dirty, state } = await startEnabled();
    cloud.respond = () => ({ status: 500, body: { error: 'boom' } });
    await edit('a', '<title>A</title>');
    await flush();
    expect(dirty()).toEqual(['html/a']);
    expect(state().notice).toBeNull();
    cloud.respond = () => undefined;
    await flush();
    expect(dirty()).toEqual([]);
  });

  test('a rejected token pauses auto-publish with a notice', async () => {
    const { cloud, edit, flush, state } = await startEnabled();
    cloud.respond = () => ({ status: 401, body: { error: 'expired' } });
    await edit('a', '<title>A</title>');
    await flush();
    expect(state().notice).toMatchObject({ kind: 'signed-out' });
    const before = cloud.requests.length;
    await flush();
    expect(cloud.requests.length).toBe(before);
  });

  test('a plan limit on create raises the cap notice with the upgrade link', async () => {
    const { cloud, edit, flush, state } = await startEnabled();
    cloud.respond = (r) => (r.method === 'POST' && r.path === '/api/artifacts' ? { status: 402, body: { error: 'The free plan allows 5 private artifacts and you have 5. Upgrade to Pro for 500.', code: 'plan_limit', plan: 'free', limit: { kind: 'private', used: 5, max: 5 }, upgradeUrl: 'https://cloud.example/billing' } } : undefined);
    await edit('a', '<title>A</title>');
    await flush();
    expect(state().notice).toMatchObject({ kind: 'cap', upgradeUrl: 'https://cloud.example/billing' });
    expect(state().notice!.message).toContain('free plan allows 5 private');
  });

  test('a refused create raises the cap notice while existing copies keep publishing', async () => {
    const { cloud, edit, flush, state, dirty } = await startEnabled();
    await edit('old', '<title>Old</title>');
    await flush();
    cloud.respond = (r) => (r.method === 'POST' && r.path === '/api/artifacts' ? { status: 403, body: { error: 'limit of 100 published artifacts reached; delete one first' } } : undefined);
    await edit('new', '<title>New</title>');
    await edit('old', '<title>Old 2</title>');
    await flush();
    expect(state().notice).toMatchObject({ kind: 'cap', message: 'limit of 100 published artifacts reached; delete one first' });
    expect(dirty()).toEqual(['html/new']);
  });
});

describe('races with manual actions', () => {
  const hold = (cloud: Awaited<ReturnType<typeof startEnabled>>['cloud'], match: (method: string, path: string) => boolean) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let seen = false;
    cloud.gate = (r) => {
      if (!match(r.method, r.path)) return undefined;
      seen = true;
      return released;
    };
    return { release, seen: () => seen };
  };

  test('a manual publish during a flush of a new artifact makes one cloud copy', async () => {
    const { server, cloud, edit } = await startEnabled();
    await edit('a', '<title>A</title>');
    const gate = hold(cloud, (method, path) => method === 'POST' && path === '/api/artifacts');
    expect((await call(server, 'POST', '/api/cloud/flush')).status).toBe(202);
    await waitFor(gate.seen);
    const manual = call(server, 'POST', '/api/cloud/publish/html/a');
    await new Promise((resolve) => setTimeout(resolve, 100));
    gate.release();
    expect((await manual).status).toBe(200);
    expect(cloud.requests.filter((r) => r.method === 'POST' && r.path === '/api/artifacts')).toHaveLength(1);
  });

  test('unpublishing during a flush leaves no cloud copy and keeps the artifact opted out', async () => {
    const { server, cloud, configFile, edit, flush } = await startEnabled();
    await edit('a', '<title>A</title>');
    await flush();
    await edit('a', '<title>A2</title>');
    const gate = hold(cloud, (method, path) => method === 'POST' && path.endsWith('/versions'));
    expect((await call(server, 'POST', '/api/cloud/flush')).status).toBe(202);
    await waitFor(gate.seen);
    const unpublish = call(server, 'DELETE', '/api/cloud/publish/html/a');
    await new Promise((resolve) => setTimeout(resolve, 100));
    gate.release();
    expect((await unpublish).status).toBe(200);
    await flush();
    expect(cloud.store.size).toBe(0);
    expect(config(configFile).artifacts['html/a']).toMatchObject({ autoPublish: false });
    expect(config(configFile).artifacts['html/a'].cloud).toBeUndefined();
  });

  test('a reserved placeholder deleted before its first publish is created again', async () => {
    const { cloud, server, configFile, edit, flush, dirty } = await startEnabled();
    expect((await call(server, 'POST', '/api/cloud/reserve/html/a')).status).toBe(200);
    cloud.store.delete('cloud1');
    await edit('a', '<title>A</title>');
    await flush();
    expect(config(configFile).artifacts['html/a'].autoPublish).not.toBe(false);
    expect(config(configFile).artifacts['html/a'].cloud).toMatchObject({ id: 'cloud2' });
    expect(config(configFile).artifacts['html/a'].cloud?.publishedAt).toBeTruthy();
    expect(dirty()).toEqual([]);
  });

  test('a copy deleted from another machine is not recreated by auto-publish', async () => {
    const { cloud, configFile, edit, flush, dirty } = await startEnabled();
    await edit('a', '<title>A</title>');
    await flush();
    cloud.store.delete('cloud1');
    await edit('a', '<title>A2</title>');
    await flush();
    expect(cloud.requests.filter((r) => r.method === 'POST' && r.path === '/api/artifacts')).toHaveLength(1);
    expect(config(configFile).artifacts['html/a']).toMatchObject({ autoPublish: false });
    expect(config(configFile).artifacts['html/a'].cloud).toBeUndefined();
    expect(dirty()).toEqual([]);
  });
});
