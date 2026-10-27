import { expect, test } from 'vitest';
import {
  createSnapshotStore,
  indexedDbPersistence,
  snapshotKey,
  type SnapshotEntry,
  type SnapshotPersistence,
} from '../src/viewer/lib/snapshot-store';

const parts = {
  artifact: 'artboard/ideas',
  file: 'pages/p/a.html',
  version: 3,
  scheme: 'light' as const,
  w: 1280,
  h: 800,
};
const entry = (label = 'full'): SnapshotEntry => ({
  blob: new Blob([label], { type: 'image/png' }),
  width: 1280,
  height: 800,
  scale: 2,
});

function memoryPersistence() {
  const saved = new Map<string, SnapshotEntry>();
  const persistence: SnapshotPersistence = {
    get: async (key) => saved.get(key),
    put: async (key, value) => {
      saved.set(key, value);
    },
  };
  return { saved, persistence };
}

function store(persistence = memoryPersistence().persistence) {
  const resized: { width: number; height: number }[] = [];
  const urls: string[] = [];
  const revoked: string[] = [];
  const instance = createSnapshotStore({
    persistence,
    resize: async (blob, width, height) => {
      resized.push({ width, height });
      return new Blob([`${await blob.text()}@${width}x${height}`]);
    },
    createUrl: (blob) => {
      const url = `blob:${urls.length}`;
      urls.push(url);
      void blob;
      return url;
    },
    revokeUrl: (url) => {
      revoked.push(url);
    },
  });
  return { instance, resized, urls, revoked };
}

test('a key names the artifact, file, version, color scheme and board size, never the content address', () => {
  expect(snapshotKey(parts)).toBe('artboard/ideas|pages/p/a.html|3|light|1280x800');
  expect(snapshotKey({ ...parts, version: 4 })).not.toBe(snapshotKey(parts));
  expect(snapshotKey({ ...parts, scheme: 'dark' })).not.toBe(snapshotKey(parts));
  expect(snapshotKey({ ...parts, w: 640 })).not.toBe(snapshotKey(parts));
});

test('an untweaked capture is persisted and comes back in a later session', async () => {
  const { saved, persistence } = memoryPersistence();
  const first = store(persistence).instance;
  await first.put(snapshotKey(parts), entry(), { persist: true });
  expect(saved.has(snapshotKey(parts))).toBe(true);
  const later = store(persistence).instance;
  expect(later.has(snapshotKey(parts))).toBe(false);
  expect(await later.load(snapshotKey(parts))).toBe(true);
  expect(later.has(snapshotKey(parts))).toBe(true);
});

test('a tweaked capture lives in memory only', async () => {
  const { saved, persistence } = memoryPersistence();
  const { instance } = store(persistence);
  await instance.put(snapshotKey(parts), entry(), { persist: false });
  expect(instance.has(snapshotKey(parts))).toBe(true);
  expect(saved.size).toBe(0);
});

test('each display scale gets its own downscaled image, sized from the board, and replacing a capture revokes them', async () => {
  const { instance, resized, revoked } = store();
  const key = snapshotKey(parts);
  await instance.put(key, entry(), { persist: false });
  expect(await instance.url(key, 2)).toBe('blob:0');
  expect(resized).toEqual([]);
  const quarter = await instance.url(key, 0.25);
  expect(resized).toEqual([{ width: 320, height: 200 }]);
  expect(await instance.url(key, 0.25)).toBe(quarter);
  expect(resized).toHaveLength(1);
  await instance.put(key, entry('newer'), { persist: false });
  expect(revoked.sort()).toEqual(['blob:0', quarter!].sort());
  expect(await instance.url(key, 0.25)).not.toBe(quarter);
});

test('missing snapshots have no url, and unsupported boards are remembered for the session only', async () => {
  const { persistence } = memoryPersistence();
  const { instance } = store(persistence);
  expect(await instance.url('nope', 1)).toBeNull();
  instance.markUnsupported('k');
  expect(instance.isUnsupported('k')).toBe(true);
  expect(store(persistence).instance.isUnsupported('k')).toBe(false);
});

test('listeners hear about new snapshots', async () => {
  const { instance } = store();
  const heard: string[] = [];
  const stop = instance.subscribe((key) => heard.push(key));
  await instance.put('a', entry(), { persist: false });
  stop();
  await instance.put('b', entry(), { persist: false });
  expect(heard).toEqual(['a']);
});

test('without IndexedDB, persistence quietly does nothing', async () => {
  const persistence = indexedDbPersistence(undefined);
  await expect(persistence.put('a', entry())).resolves.toBeUndefined();
  await expect(persistence.get('a')).resolves.toBeUndefined();
});

test('every new capture of a key gets a new revision', async () => {
  const { instance } = store();
  const key = snapshotKey(parts);
  expect(instance.revision(key)).toBe(0);
  await instance.put(key, entry('one'), { persist: false });
  await instance.put(key, entry('two'), { persist: false });
  expect(instance.revision(key)).toBe(2);
});
