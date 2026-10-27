export interface SnapshotKeyParts {
  artifact: string;
  file: string;
  version: number;
  scheme: 'light' | 'dark';
  w: number;
  h: number;
}
export interface SnapshotEntry {
  blob: Blob;
  width: number;
  height: number;
  scale: number;
}
export interface SnapshotPersistence {
  get(key: string): Promise<SnapshotEntry | undefined>;
  put(key: string, entry: SnapshotEntry): Promise<void>;
}
type Resize = (blob: Blob, width: number, height: number) => Promise<Blob>;

const MAX_URLS = 80;
const MAX_PERSISTED = 400;

export const snapshotKey = ({ artifact, file, version, scheme, w, h }: SnapshotKeyParts) =>
  `${artifact}|${file}|${version}|${scheme}|${w}x${h}`;

export async function bitmapResize(blob: Blob, width: number, height: number) {
  const bitmap = await createImageBitmap(blob, {
    resizeWidth: Math.max(1, width),
    resizeHeight: Math.max(1, height),
    resizeQuality: 'high',
  });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.convertToBlob({ type: 'image/png' });
}

export function indexedDbPersistence(
  factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB,
): SnapshotPersistence {
  let database: Promise<IDBDatabase | null> | null = null;
  const open = () =>
    (database ??= new Promise((resolve) => {
      if (!factory) return resolve(null);
      try {
        const request = factory.open('ryugi-snapshots', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));
  const run = async <T>(
    mode: IDBTransactionMode,
    work: (store: IDBObjectStore) => IDBRequest<T>,
  ) => {
    const db = await open();
    if (!db) return undefined;
    return new Promise<T | undefined>((resolve) => {
      try {
        const request = work(db.transaction('snapshots', mode).objectStore('snapshots'));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  };
  const prune = async () => {
    const [keys, rows] = await Promise.all([
      run('readonly', (store) => store.getAllKeys()),
      run('readonly', (store) => store.getAll() as IDBRequest<{ at: number }[]>),
    ]);
    if (!keys || !rows || keys.length <= MAX_PERSISTED) return;
    const oldest = keys
      .map((key, at) => ({ key, at: rows[at]?.at ?? 0 }))
      .sort((a, b) => a.at - b.at)
      .slice(0, keys.length - MAX_PERSISTED);
    for (const { key } of oldest) await run('readwrite', (store) => store.delete(key));
  };
  return {
    async get(key) {
      return (
        await run(
          'readonly',
          (store) => store.get(key) as IDBRequest<{ entry: SnapshotEntry } | undefined>,
        )
      )?.entry;
    },
    async put(key, entry) {
      await run('readwrite', (store) => store.put({ entry, at: Date.now() }, key));
      await prune();
    },
  };
}

export function createSnapshotStore({
  persistence = indexedDbPersistence(),
  resize = bitmapResize,
  createUrl = (blob: Blob) => URL.createObjectURL(blob),
  revokeUrl = (url: string) => URL.revokeObjectURL(url),
}: {
  persistence?: SnapshotPersistence;
  resize?: Resize;
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
} = {}) {
  const entries = new Map<string, SnapshotEntry>();
  const urls = new Map<string, Promise<string>>();
  const unsupported = new Set<string>();
  const revisions = new Map<string, number>();
  const listeners = new Set<(key: string) => void>();
  const forget = (key: string) => {
    for (const [name, url] of urls) {
      if (!name.startsWith(`${key}@`)) continue;
      urls.delete(name);
      void url.then(revokeUrl, () => undefined);
    }
  };
  const remember = (key: string, entry: SnapshotEntry) => {
    forget(key);
    entries.set(key, entry);
    revisions.set(key, (revisions.get(key) ?? 0) + 1);
    for (const listener of listeners) listener(key);
  };
  return {
    has: (key: string) => entries.has(key),
    revision: (key: string) => revisions.get(key) ?? 0,
    async load(key: string) {
      if (entries.has(key)) return true;
      const entry = await persistence.get(key);
      if (entry && !entries.has(key)) remember(key, entry);
      return entries.has(key);
    },
    async put(key: string, entry: SnapshotEntry, { persist }: { persist: boolean }) {
      remember(key, entry);
      if (persist) await persistence.put(key, entry);
    },
    url(key: string, scale: number): Promise<string | null> {
      const entry = entries.get(key);
      if (!entry) return Promise.resolve(null);
      const full = scale >= entry.scale;
      const name = `${key}@${full ? 'full' : scale}`;
      let url = urls.get(name);
      if (url) urls.delete(name);
      else
        url = full
          ? Promise.resolve(createUrl(entry.blob))
          : resize(
              entry.blob,
              Math.round(entry.width * scale),
              Math.round(entry.height * scale),
            ).then(createUrl);
      urls.set(name, url);
      while (urls.size > MAX_URLS) {
        const [oldest, stale] = urls.entries().next().value!;
        urls.delete(oldest);
        void stale.then(revokeUrl, () => undefined);
      }
      return url;
    },
    markUnsupported: (key: string) => void unsupported.add(key),
    isUnsupported: (key: string) => unsupported.has(key),
    subscribe(listener: (key: string) => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export type SnapshotStore = ReturnType<typeof createSnapshotStore>;
