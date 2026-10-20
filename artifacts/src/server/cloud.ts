import crypto from 'node:crypto';
import type http from 'node:http';
import { artifactKeyOf, type ArtifactRef } from './artifacts';
import { CALLBACK_PAGE_CSP, callbackPage } from './callback-page';
import { isVisibility } from '../shared/cloud';
import { readConfig, updateArtifactConfig, type Visibility } from './config';
import { clearCredentials, readCredentials, writeCredentials } from './credentials';
import { randomToken, send, sendJson } from './http';
import { packArtifact } from './pack';
import { withCloudRuntime } from './publish-payload';

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
const MAX_JSON_BODY = 4096;
const CLOUD_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ROUTE = /^\/api\/cloud\/(status|login|logout|artifacts|publish|visibility)(?:\/([^/]+)(?:\/([^/]+))?)?$/;

class SignedOut extends Error {}

class CloudRefused extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
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

async function errorMessage(res: Response) {
  const text = await res.text().catch(() => '');
  try {
    const parsed = JSON.parse(text) as { error?: unknown };
    return typeof parsed.error === 'string' ? parsed.error : text;
  } catch {
    return text || res.statusText;
  }
}

export function createCloudRoutes(options: CloudRoutesOptions) {
  const { origin, credentialsFile, configFile } = options;
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

  const cloudFetch = async (method: string, path: string, body?: FormData | object) => {
    const credentials = readCredentials(credentialsFile, origin);
    if (!credentials) throw new SignedOut();
    const headers: Record<string, string> = { Authorization: `Bearer ${credentials.token}` };
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (body) {
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
    if (!res.ok) throw new CloudRefused(502, `cloud refused (${res.status}): ${await errorMessage(res)}`);
    return res;
  };

  const artifactEntry = (key: string) => readConfig(configFile).config.artifacts[key] ?? {};

  const publish = async (ref: ArtifactRef, requested?: Visibility) => {
    const inspected = await options.inspect(ref);
    if (!inspected) throw new CloudRefused(404, `${ref.type}/${ref.id} not found`);
    if (inspected.reasons.length > 0 || !inspected.payload) return { status: 409, body: { error: 'fix these before publishing', reasons: inspected.reasons } };
    let files;
    try {
      files = withCloudRuntime(ref.type, packArtifact(inspected.dir, ref.type));
    } catch (err) {
      throw new CloudRefused(413, (err as Error).message);
    }
    const key = `${ref.type}/${ref.id}`;
    const entry = artifactEntry(key);
    const upload = (visibility: Visibility | undefined) => {
      const form = new FormData();
      form.set('meta', JSON.stringify({ type: ref.type, title: inspected.title, ...(visibility ? { visibility } : {}) }));
      form.set('payload', JSON.stringify(inspected.payload));
      for (const file of files) form.set(`file:${file.path}`, new Blob([new Uint8Array(file.data)]), file.path);
      return form;
    };
    let res = entry.cloud ? await cloudFetch('PUT', `/api/artifacts/${entry.cloud.id}`, upload(requested)) : null;
    if (!res || res.status === 404) res = await cloudFetch('POST', '/api/artifacts', upload(requested ?? entry.visibility ?? 'private'));
    const published = (await (await expectOk(res)).json()) as CloudArtifact;
    updateArtifactConfig(configFile, key, {
      visibility: published.visibility,
      cloud: { id: published.id, url: published.url, publishedAt: published.updatedAt, visibility: published.visibility },
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
      if (entry.cloud?.id === cloudId) updateArtifactConfig(configFile, key, { cloud: null });
    }
  };

  const route = async (req: http.IncomingMessage, res: http.ServerResponse, match: RegExpExecArray) => {
    const [, action, first, second] = match;
    const method = req.method ?? 'GET';
    const ref = first && second ? artifactKeyOf(`${first}/${second}`) : null;

    if (action === 'status' && method === 'GET' && !first) {
      const credentials = readCredentials(credentialsFile, origin);
      const { config, warning } = readConfig(configFile);
      sendJson(res, 200, { signedIn: !!credentials, login: credentials?.login ?? null, origin, artifacts: config.artifacts, warning: warning ?? null });
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
      await deleteCloud(first);
      sendJson(res, 200, { deleted: first });
      return;
    }
    if (action === 'publish' && ref && method === 'POST') {
      const body = (await readJsonBody(req)) as { visibility?: unknown } | null;
      if (body?.visibility !== undefined && !isVisibility(body.visibility)) throw new CloudRefused(400, 'visibility must be "public" or "private"');
      const result = await publish(ref, body?.visibility);
      sendJson(res, result.status, result.body);
      return;
    }
    if (action === 'publish' && ref && method === 'DELETE') {
      const entry = artifactEntry(`${ref.type}/${ref.id}`);
      if (entry.cloud) await deleteCloud(entry.cloud.id);
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
    send(res, 404, 'Not found');
  };

  return {
    async handleCallback(url: URL, res: http.ServerResponse) {
      const page = (status: number, result: { ok: true; login: string } | { ok: false; detail: string }) =>
        send(res, status, callbackPage({ ...result, origin }), {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': CALLBACK_PAGE_CSP,
        });
      const state = url.searchParams.get('state') ?? '';
      const pending = pendingStates.get(state);
      pendingStates.delete(state);
      const code = url.searchParams.get('code');
      if (!pending || pending.expires < Date.now() || !code) {
        page(400, { ok: false, detail: '这个登录链接已过期或已经用过。回到 Ryugi 重新发起一次登录。' });
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
        page(502, { ok: false, detail: `连不上 ${origin}（${(err as Error).message}）。检查网络后回到 Ryugi 重新发起登录。` });
        return;
      }
      const issued = (await swap.json().catch(() => ({}))) as { token?: unknown; login?: unknown; error?: unknown };
      if (!swap.ok || typeof issued.token !== 'string' || typeof issued.login !== 'string') {
        const reason = typeof issued.error === 'string' ? issued.error : `HTTP ${swap.status}`;
        page(400, { ok: false, detail: `Ryugi Cloud 没有接受这次登录（${reason}）。回到 Ryugi 重新发起登录。` });
        return;
      }
      writeCredentials(credentialsFile, { origin, token: issued.token, login: issued.login });
      page(200, { ok: true, login: issued.login });
    },

    match: (pathname: string) => ROUTE.exec(pathname),

    async handle(req: http.IncomingMessage, res: http.ServerResponse, match: RegExpExecArray) {
      try {
        await route(req, res, match);
      } catch (err) {
        if (res.headersSent) return;
        if (err instanceof SignedOut) {
          sendJson(res, 401, { error: 'not signed in to the Ryugi cloud', loginUrl: loginUrl() });
        } else if (err instanceof CloudRefused) {
          sendJson(res, err.status, { error: err.message });
        } else {
          sendJson(res, 500, { error: (err as Error).message });
        }
      }
    },
  };
}

export type CloudRoutes = ReturnType<typeof createCloudRoutes>;
