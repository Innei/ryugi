import crypto from 'node:crypto';
import type http from 'node:http';
import { artifactKeyOf, type ArtifactRef } from './artifacts';
import { CALLBACK_PAGE_CSP, callbackPage } from './callback-page';
import { isVisibility } from '../shared/cloud';
import { cloudErrorDetails, type CloudErrorDetails } from '../shared/cloud-error';
import { readConfig, setProjectAutoPublish, updateArtifactConfig, type Visibility } from './config';
import { clearCredentials, readCredentials, writeCredentials } from './credentials';
import { hostIdFor } from './host-id';
import { randomToken, send, sendJson } from './http';
import { packArtifact } from './pack';
import type { AutoPublishOutcome } from './auto-publish';
import { withCloudRuntime } from './publish-payload';
import { autoPublishEnabled, defaultGlobalAutoPublish, readGlobalAutoPublish, settingsFileFor, writeGlobalAutoPublish } from './settings';
import type { Locale } from '../shared/locale';
import { serverText } from './locales';

export interface CloudOptions {
  origin: string;
  credentialsFile: string;
}

export interface InspectedArtifact {
  dir: string;
  title: string;
  reasons: string[];
  payload: Record<string, unknown> | null;
}

interface CloudRoutesOptions extends CloudOptions {
  configFile: string;
  project: string;
  port: () => number;
  inspect: (ref: ArtifactRef) => Promise<InspectedArtifact | null>;
}

interface CloudArtifact {
  id: string;
  url: string;
  visibility: Visibility;
  updatedAt: string;
}

const LOGIN_STATE_TTL_MS = 10 * 60 * 1000;
const UPLOAD_CONCURRENCY = 6;
const MAX_JSON_BODY = 4096;
const CLOUD_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ROUTE = /^\/api\/cloud\/(status|login|logout|artifacts|publish|reserve|visibility|auto-publish|sync)(?:\/([^/]+)(?:\/([^/]+))?)?$/;

class SignedOut extends Error {}

class CloudRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: CloudErrorDetails = {},
  ) {
    super(message);
  }
}

class CloudCopyGone extends Error {}

class PlanLimited extends CloudRefused {
  constructor(
    message: string,
    readonly upgradeUrl: string,
    details: CloudErrorDetails,
  ) {
    super(402, message, details);
  }
}

class CreateRefused extends CloudRefused {
  constructor(readonly detail: string) {
    super(403, `cloud refused (403): ${detail}`);
  }
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_JSON_BODY) throw new CloudRefused(413, 'request body too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
  } catch {
    return null;
  }
}

async function refuse(res: Response): Promise<never> {
  const text = await res.text().catch(() => '');
  let parsed: { error?: unknown } = {};
  try {
    const body: unknown = JSON.parse(text);
    if (body && typeof body === 'object') parsed = body;
  } catch {}
  const details = cloudErrorDetails(parsed);
  const message = typeof parsed.error === 'string' ? parsed.error : text || res.statusText;
  if (res.status === 402 && details.code === 'plan_limit' && details.upgradeUrl) throw new PlanLimited(message, details.upgradeUrl, details);
  throw new CloudRefused(res.status, `cloud refused (${res.status}): ${message}`, details);
}

async function errorMessage(res: Response) {
  const text = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : text;
  } catch {
    return text || res.statusText;
  }
}

function fingerprintPayload(payload: Record<string, unknown>) {
  const versions = payload.versions as Record<string, number> | undefined;
  if (!versions) return payload;
  return { ...payload, versions: Object.fromEntries(Object.entries(versions).map(([file, version]) => [file, version > 0])) };
}

export function createCloudRoutes(options: CloudRoutesOptions) {
  const { origin, credentialsFile, configFile, project } = options;
  const settingsFile = settingsFileFor(credentialsFile);
  const autoPublishState = () => ({
    global: readGlobalAutoPublish(settingsFile) ?? null,
    project: readConfig(configFile).config.autoPublish ?? null,
    enabled: !!readCredentials(credentialsFile, origin) && autoPublishEnabled({ globalFile: settingsFile, projectFile: configFile }),
  });
  const pendingStates = new Map<string, { expires: number; verifier: string }>();

  const loginUrl = () => {
    const now = Date.now();
    for (const [state, pending] of pendingStates) if (pending.expires < now) pendingStates.delete(state);
    const state = randomToken();
    const verifier = randomToken();
    pendingStates.set(state, { expires: now + LOGIN_STATE_TTL_MS, verifier });
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    return `${origin}/auth/cli?port=${options.port()}&state=${state}&challenge=${challenge}`;
  };

  const cloudFetch = async (method: string, path: string, body?: Uint8Array<ArrayBuffer> | object) => {
    const credentials = readCredentials(credentialsFile, origin);
    if (!credentials) throw new SignedOut();
    const headers: Record<string, string> = { Authorization: `Bearer ${credentials.token}` };
    let payload: BodyInit | undefined;
    if (body instanceof Uint8Array) {
      headers['Content-Type'] = 'application/octet-stream';
      payload = body;
    } else if (body) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await fetch(`${origin}${path}`, { method, headers, body: payload });
    } catch (err) {
      throw new CloudRefused(502, `could not reach ${origin}: ${(err as Error).message}`);
    }
    if (res.status === 401) throw new SignedOut();
    return res;
  };

  const expectOk = async (res: Response) => {
    if (!res.ok) await refuse(res);
    return res;
  };

  const artifactEntry = (key: string) => readConfig(configFile).config.artifacts[key] ?? {};

  const locks = new Map<string, Promise<unknown>>();
  const serialized = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const run = (locks.get(key) ?? Promise.resolve()).then(task, task);
    const tail = run.catch(() => undefined);
    locks.set(key, tail);
    void tail.then(() => {
      if (locks.get(key) === tail) locks.delete(key);
    });
    return run;
  };
  const keyOfCloudId = (cloudId: string) =>
    Object.entries(readConfig(configFile).config.artifacts).find(([, entry]) => entry.cloud?.id === cloudId)?.[0] ?? `cloud:${cloudId}`;

  const createRecord = async (ref: ArtifactRef, visibility: Visibility) => {
    const res = await cloudFetch('POST', '/api/artifacts', { type: ref.type, visibility, project });
    if (res.status === 403) throw new CreateRefused(await errorMessage(res));
    const created = (await (await expectOk(res)).json()) as CloudArtifact;
    updateArtifactConfig(configFile, `${ref.type}/${ref.id}`, {
      visibility: created.visibility,
      cloud: { id: created.id, url: created.url, publishedAt: null, visibility: created.visibility },
    });
    return created.id;
  };

  const reserve = async (ref: ArtifactRef) => {
    const key = `${ref.type}/${ref.id}`;
    const entry = artifactEntry(key);
    if (entry.cloud) return { url: entry.cloud.url };
    if (entry.autoPublish === false || !autoPublishState().enabled) return { url: null };
    try {
      await createRecord(ref, entry.visibility ?? 'private');
    } catch (err) {
      return err instanceof PlanLimited ? { url: null, limit: { message: err.message, upgradeUrl: err.upgradeUrl } } : { url: null };
    }
    return { url: artifactEntry(key).cloud?.url ?? null };
  };

  const prepare = async (ref: ArtifactRef) => {
    const inspected = await options.inspect(ref);
    if (!inspected) throw new CloudRefused(404, `${ref.type}/${ref.id} not found`);
    if (inspected.reasons.length > 0 || !inspected.payload) return { ready: false as const, reasons: inspected.reasons };
    let packed;
    try {
      packed = packArtifact(inspected.dir, ref.type);
    } catch (err) {
      throw new CloudRefused(413, (err as Error).message);
    }
    const sha = (data: Buffer | string) => crypto.createHash('sha256').update(data).digest('hex');
    const hashed = withCloudRuntime(ref.type, packed).map((file) => ({ ...file, hash: sha(file.data) }));
    const content = { title: inspected.title, payload: inspected.payload, files: hashed.map(({ path, hash }) => ({ path, hash })) };
    const fingerprint = sha(JSON.stringify({ title: inspected.title, payload: fingerprintPayload(inspected.payload), files: packed.map((file) => ({ path: file.path, hash: sha(file.data) })) }));
    return { ready: true as const, hashed, content, fingerprint };
  };

  const upToDate = async (ref: ArtifactRef) => {
    const cloud = artifactEntry(`${ref.type}/${ref.id}`).cloud;
    if (!cloud?.publishedAt) {
      if (!(await options.inspect(ref))) throw new CloudRefused(404, `${ref.type}/${ref.id} not found`);
      return null;
    }
    const prepared = await prepare(ref);
    return prepared.ready ? prepared.fingerprint === cloud.fingerprint : null;
  };

  const publish = async (ref: ArtifactRef, requested?: Visibility, { recreate = true, skipUnchanged = false } = {}) => {
    const prepared = await prepare(ref);
    if (!prepared.ready) return { status: 409, body: { error: 'fix these before publishing', reasons: prepared.reasons } };
    const { hashed, content, fingerprint } = prepared;
    const key = `${ref.type}/${ref.id}`;
    const entry = artifactEntry(key);
    const current = entry.cloud;
    if (skipUnchanged && current?.publishedAt && current.fingerprint === fingerprint) {
      return { status: 200, body: { id: current.id, url: current.url, visibility: current.visibility, publishedAt: current.publishedAt } };
    }
    const byHash = new Map(hashed.map((file) => [file.hash, file.data]));
    const version = (visibility: Visibility | undefined) => ({ ...content, project, ...(visibility ? { visibility } : {}) });

    const create = () => createRecord(ref, requested ?? entry.visibility ?? 'private');

    const upload = async (id: string, hashes: string[]) => {
      for (let i = 0; i < hashes.length; i += UPLOAD_CONCURRENCY) {
        await Promise.all(
          hashes.slice(i, i + UPLOAD_CONCURRENCY).map(async (hash) => {
            const data = byHash.get(hash);
            if (!data) throw new CloudRefused(502, `cloud asked for a file this artifact does not have (${hash})`);
            await expectOk(await cloudFetch('PUT', `/api/artifacts/${id}/blobs/${hash}`, new Uint8Array(data)));
          }),
        );
      }
    };

    const commit = async (id: string, visibility: Visibility | undefined) => {
      const res = await cloudFetch('POST', `/api/artifacts/${id}/versions`, version(visibility));
      if (res.status !== 409) return res;
      const { missing } = (await res.clone().json().catch(() => ({}))) as { missing?: unknown };
      if (!Array.isArray(missing)) return res;
      await upload(id, missing as string[]);
      return cloudFetch('POST', `/api/artifacts/${id}/versions`, version(visibility));
    };

    let res = entry.cloud ? await commit(entry.cloud.id, requested) : await commit(await create(), undefined);
    if (res.status === 404 && entry.cloud) {
      if (!recreate && entry.cloud.publishedAt) throw new CloudCopyGone();
      res = await commit(await create(), undefined);
    }
    const published = (await (await expectOk(res)).json()) as CloudArtifact;
    updateArtifactConfig(configFile, key, {
      visibility: published.visibility,
      cloud: { id: published.id, url: published.url, publishedAt: published.updatedAt, visibility: published.visibility, fingerprint },
    });
    return { status: 200, body: { id: published.id, url: published.url, visibility: published.visibility, publishedAt: published.updatedAt } };
  };

  const setVisibility = async (ref: ArtifactRef, visibility: Visibility) => {
    if (!(await options.inspect(ref))) throw new CloudRefused(404, `${ref.type}/${ref.id} not found`);
    const key = `${ref.type}/${ref.id}`;
    const entry = artifactEntry(key);
    if (entry.cloud) {
      const res = await cloudFetch('PATCH', `/api/artifacts/${entry.cloud.id}`, { visibility });
      if (res.status === 404) updateArtifactConfig(configFile, key, { cloud: null });
      else {
        const updated = (await (await expectOk(res)).json()) as CloudArtifact;
        updateArtifactConfig(configFile, key, { cloud: { ...entry.cloud, visibility: updated.visibility } });
      }
    }
    return updateArtifactConfig(configFile, key, { visibility });
  };

  const adoptCloudVisibility = (artifacts: CloudArtifact[]) => {
    const current = new Map(artifacts.map((artifact) => [artifact.id, artifact.visibility]));
    for (const [key, entry] of Object.entries(readConfig(configFile).config.artifacts)) {
      const visibility = entry.cloud && current.get(entry.cloud.id);
      if (!entry.cloud || !visibility || (entry.visibility === visibility && entry.cloud.visibility === visibility)) continue;
      updateArtifactConfig(configFile, key, { visibility, cloud: { ...entry.cloud, visibility } });
    }
  };

  const deleteCloud = async (cloudId: string) => {
    const res = await cloudFetch('DELETE', `/api/artifacts/${cloudId}`);
    if (res.status !== 404) await expectOk(res);
    for (const [key, entry] of Object.entries(readConfig(configFile).config.artifacts)) {
      if (entry.cloud?.id === cloudId) updateArtifactConfig(configFile, key, { cloud: null, autoPublish: false });
    }
  };

  const autoPublish = (key: string) => serialized(key, () => autoPublishNow(key));

  const autoPublishNow = async (key: string): Promise<AutoPublishOutcome> => {
    const ref = artifactKeyOf(key);
    if (!ref) return { kind: 'gone' };
    const entry = artifactEntry(key);
    if (entry.autoPublish === false) return { kind: 'opted-out' };
    try {
      const result = await publish(ref, undefined, { recreate: false, skipUnchanged: true });
      if (result.status !== 200) return { kind: 'not-ready' };
      return { kind: 'published', created: (result.body as { id?: unknown }).id !== entry.cloud?.id };
    } catch (err) {
      if (err instanceof CloudCopyGone) {
        updateArtifactConfig(configFile, key, { cloud: null, autoPublish: false });
        return { kind: 'opted-out' };
      }
      if (err instanceof SignedOut) return { kind: 'signed-out' };
      if (err instanceof PlanLimited) return { kind: 'cannot-create', message: err.message, upgradeUrl: err.upgradeUrl };
      if (err instanceof CreateRefused) return { kind: 'cannot-create', message: err.detail };
      if (err instanceof CloudRefused && err.status === 404) return { kind: 'gone' };
      if (err instanceof CloudRefused && err.status === 413) return { kind: 'cannot-create', message: err.message };
      return { kind: 'failed', message: (err as Error).message };
    }
  };

  const route = async (req: http.IncomingMessage, res: http.ServerResponse, match: RegExpExecArray) => {
    const [, action, first, second] = match;
    const method = req.method ?? 'GET';
    const ref = first && second ? artifactKeyOf(`${first}/${second}`) : null;

    if (action === 'status' && method === 'GET' && !first) {
      const credentials = readCredentials(credentialsFile, origin);
      const { config, warning } = readConfig(configFile);
      sendJson(res, 200, { signedIn: !!credentials, login: credentials?.login ?? null, origin, hostId: hostIdFor(credentialsFile), artifacts: config.artifacts, autoPublish: autoPublishState(), warning: warning ?? null });
      return;
    }
    if (action === 'login' && method === 'POST' && !first) {
      sendJson(res, 200, { url: loginUrl() });
      return;
    }
    if (action === 'logout' && method === 'POST' && !first) {
      const credentials = readCredentials(credentialsFile, origin);
      if (credentials) {
        await fetch(`${origin}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${credentials.token}` } }).catch(() => undefined);
      }
      clearCredentials(credentialsFile);
      sendJson(res, 200, { signedIn: false });
      return;
    }
    if (action === 'artifacts' && method === 'GET' && !first) {
      const listed = (await (await expectOk(await cloudFetch('GET', '/api/artifacts'))).json()) as { artifacts: CloudArtifact[] };
      adoptCloudVisibility(listed.artifacts);
      sendJson(res, 200, listed);
      return;
    }
    if (action === 'artifacts' && method === 'DELETE' && first && !second) {
      if (!CLOUD_ID.test(first)) throw new CloudRefused(400, 'not a cloud artifact id');
      await serialized(keyOfCloudId(first), () => deleteCloud(first));
      sendJson(res, 200, { deleted: first });
      return;
    }
    if (action === 'publish' && ref && method === 'POST') {
      const body = (await readJsonBody(req)) as { visibility?: unknown } | null;
      if (body?.visibility !== undefined && !isVisibility(body.visibility)) throw new CloudRefused(400, 'visibility must be "public" or "private"');
      const key = `${ref.type}/${ref.id}`;
      const requested = body?.visibility;
      const result = await serialized(key, async () => {
        const published = await publish(ref, requested);
        if (published.status === 200) updateArtifactConfig(configFile, key, { autoPublish: null });
        return published;
      });
      sendJson(res, result.status, result.body);
      return;
    }
    if (action === 'sync' && ref && method === 'GET') {
      sendJson(res, 200, { upToDate: await serialized(`${ref.type}/${ref.id}`, () => upToDate(ref)) });
      return;
    }
    if (action === 'reserve' && ref && method === 'POST') {
      sendJson(res, 200, await serialized(`${ref.type}/${ref.id}`, () => reserve(ref)));
      return;
    }
    if (action === 'publish' && ref && method === 'DELETE') {
      const key = `${ref.type}/${ref.id}`;
      await serialized(key, async () => {
        const entry = artifactEntry(key);
        if (entry.cloud) await deleteCloud(entry.cloud.id);
        updateArtifactConfig(configFile, key, { autoPublish: false });
      });
      sendJson(res, 200, { unpublished: `${ref.type}/${ref.id}` });
      return;
    }
    if (action === 'visibility' && ref && method === 'POST') {
      const body = (await readJsonBody(req)) as { visibility?: unknown } | null;
      const visibility = body?.visibility;
      if (!isVisibility(visibility)) throw new CloudRefused(400, 'visibility must be "public" or "private"');
      sendJson(res, 200, await setVisibility(ref, visibility));
      return;
    }
    if (action === 'auto-publish' && method === 'POST' && !first) {
      const body = (await readJsonBody(req)) as { scope?: unknown; value?: unknown } | null;
      const value = body?.value;
      if (body?.scope === 'global' && typeof value === 'boolean') writeGlobalAutoPublish(settingsFile, value);
      else if (body?.scope === 'project' && (typeof value === 'boolean' || value === null)) setProjectAutoPublish(configFile, value);
      else throw new CloudRefused(400, 'send {"scope":"global","value":true|false} or {"scope":"project","value":true|false|null}');
      sendJson(res, 200, autoPublishState());
      return;
    }
    send(res, 404, 'Not found');
  };

  return {
    async handleCallback(url: URL, res: http.ServerResponse, locale: Locale = 'en') {
      const t = serverText(locale);
      const page = (status: number, result: { ok: true; login: string; autoPublish: boolean } | { ok: false; detail: string }) =>
        send(res, status, callbackPage({ ...result, origin }, locale), {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': CALLBACK_PAGE_CSP,
        });
      const state = url.searchParams.get('state') ?? '';
      const pending = pendingStates.get(state);
      pendingStates.delete(state);
      const code = url.searchParams.get('code');
      if (!pending || pending.expires < Date.now() || !code) {
        page(400, { ok: false, detail: t('login.expired') });
        return;
      }
      let swap: Response;
      try {
        swap = await fetch(`${origin}/auth/cli/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, verifier: pending.verifier }),
        });
      } catch (err) {
        page(502, { ok: false, detail: t('login.unreachable', { origin, message: (err as Error).message }) });
        return;
      }
      const issued = (await swap.json().catch(() => ({}))) as { token?: unknown; login?: unknown; error?: unknown };
      if (!swap.ok || typeof issued.token !== 'string' || typeof issued.login !== 'string') {
        const reason = typeof issued.error === 'string' ? issued.error : `HTTP ${swap.status}`;
        page(400, { ok: false, detail: t('login.refused', { reason }) });
        return;
      }
      writeCredentials(credentialsFile, { origin, token: issued.token, login: issued.login });
      defaultGlobalAutoPublish(settingsFile);
      page(200, { ok: true, login: issued.login, autoPublish: autoPublishState().enabled });
    },

    match: (pathname: string) => ROUTE.exec(pathname),

    autoPublish,
    autoPublishEnabled: () => autoPublishState().enabled,
    token: () => readCredentials(credentialsFile, origin)?.token ?? null,

    async handle(req: http.IncomingMessage, res: http.ServerResponse, match: RegExpExecArray) {
      try {
        await route(req, res, match);
      } catch (err) {
        if (res.headersSent) return;
        if (err instanceof SignedOut) {
          sendJson(res, 401, { error: 'not signed in to the Ryugi cloud', loginUrl: loginUrl() });
        } else if (err instanceof PlanLimited) {
          sendJson(res, 402, { error: err.message, ...err.details });
        } else if (err instanceof CloudRefused) {
          sendJson(res, err.status, { error: err.message, ...err.details });
        } else {
          sendJson(res, 500, { error: (err as Error).message });
        }
      }
    },
  };
}

export type CloudRoutes = ReturnType<typeof createCloudRoutes>;
