import { describe, expect, test } from 'vitest';
import { createAvatars, githubAvatar, gravatarAvatar } from '../src/server/avatars';

const png = new Uint8Array([137, 80, 78, 71]);

function fakeFetch(respond: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetch = async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    return respond(url);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

const image = () => new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });

describe('avatar paths', () => {
  test('a GitHub login maps to the proxy route', () => {
    expect(githubAvatar('Innei')).toBe('/api/avatar/github/Innei');
  });

  test('an email maps to the Gravatar of its trimmed lowercase sha256', () => {
    expect(gravatarAvatar(' Git@Example.com ')).toBe('/api/avatar/gravatar/c2695de4a87d7f4470ee32f01c25b264876f4da96e3241dd50f51184381ec8fd');
  });
});

describe('createAvatars', () => {
  test('fetches a GitHub avatar from GitHub once, then serves it from memory', async () => {
    const { fetch, calls } = fakeFetch(image);
    const avatars = createAvatars(fetch);
    const first = await avatars.load('github', 'Innei');
    const second = await avatars.load('github', 'Innei');
    expect(first).toEqual({ status: 200, type: 'image/png', body: Buffer.from(png) });
    expect(second).toEqual(first);
    expect(calls).toEqual(['https://avatars.githubusercontent.com/Innei?s=64']);
  });

  test('a Gravatar is fetched with d=404, and its 404 is remembered', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('', { status: 404 }));
    const avatars = createAvatars(fetch);
    const hash = 'a'.repeat(64);
    expect((await avatars.load('gravatar', hash)).status).toBe(404);
    expect((await avatars.load('gravatar', hash)).status).toBe(404);
    expect(calls).toEqual([`https://gravatar.com/avatar/${hash}?s=64&d=404`]);
  });

  test.each([
    ['github', '../etc'],
    ['github', 'a'.repeat(40)],
    ['github', 'x?y'],
    ['gravatar', 'abc'],
    ['other', 'Innei'],
  ])('refuses %s/%s without fetching', async (source, id) => {
    const { fetch, calls } = fakeFetch(image);
    expect((await createAvatars(fetch).load(source, id)).status).toBe(404);
    expect(calls).toEqual([]);
  });

  test('a response that is not an image is a 404', async () => {
    const { fetch } = fakeFetch(() => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
    expect((await createAvatars(fetch).load('github', 'Innei')).status).toBe(404);
  });

  test('a network failure is a 502 and is retried next time', async () => {
    let fail = true;
    const { fetch, calls } = fakeFetch(() => {
      if (fail) throw new Error('offline');
      return image();
    });
    const avatars = createAvatars(fetch);
    expect((await avatars.load('github', 'Innei')).status).toBe(502);
    fail = false;
    expect((await avatars.load('github', 'Innei')).status).toBe(200);
    expect(calls).toHaveLength(2);
  });
});
