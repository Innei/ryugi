import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { readAutoPublishState } from '../src/server/auto-publish';
import { updateArtifactConfig } from '../src/server/config';
import { settingsFileFor, writeGlobalAutoPublish } from '../src/server/settings';
import { call, closeAll, config, requestLines, start } from './fake-cloud';
import { writeHtml } from './helpers';

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
