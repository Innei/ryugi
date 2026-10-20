import { ARTIFACT_ERROR, ARTIFACT_PATTERN, CliError, projectPaths } from './paths';
import { readText } from './process';
import type { Emit } from './start';

export type PublishAction = 'publish' | 'unpublish' | 'list' | 'delete' | 'login' | 'logout';

export interface PublishOptions {
  projectDir: string;
  action: PublishAction;
  artifact?: string;
  visibility?: 'public' | 'private';
  cloudId?: string;
}

const NOT_RUNNING = 'No artifacts server is running for this project. Start it with `ryugi-artifacts start`, then run this again.';

export async function publish(options: PublishOptions, emit: Emit): Promise<number> {
  if (options.action === 'publish' || options.action === 'unpublish') {
    if (!options.artifact) throw new CliError('--artifact <type>/<id> is required');
    if (!ARTIFACT_PATTERN.test(options.artifact)) throw new CliError(ARTIFACT_ERROR);
  }
  if (options.action === 'delete' && !/^[A-Za-z0-9_-]{1,64}$/.test(options.cloudId ?? '')) throw new CliError('--delete needs a cloud artifact id from --list');
  const paths = projectPaths(options.projectDir);
  let info: { url: string };
  try {
    info = JSON.parse(readText(paths.info) ?? '');
  } catch {
    throw new CliError(NOT_RUNNING);
  }
  const base = new URL(info.url);
  const key = base.searchParams.get('key') ?? '';
  if (base.hostname === 'localhost') base.hostname = '127.0.0.1';
  const call = async (method: string, route: string, body?: unknown) => {
    let res: Response;
    try {
      res = await fetch(`${base.origin}${route}?key=${encodeURIComponent(key)}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new CliError(NOT_RUNNING);
    }
    const json = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (res.status === 401) throw new CliError('', { type: 'login-required', url: json.loginUrl, message: 'Open url to sign in to the Ryugi cloud, then run the same command again.' }, 2);
    if (!res.ok) throw new CliError(json.error || `HTTP ${res.status}`, json.reasons ? { reasons: json.reasons } : {});
    return json;
  };
  const { action, artifact, cloudId } = options;
  if (action === 'list') emit({ type: 'cloud-artifacts', artifacts: (await call('GET', '/api/cloud/artifacts')).artifacts });
  else if (action === 'delete') {
    await call('DELETE', `/api/cloud/artifacts/${cloudId}`);
    emit({ type: 'deleted', id: cloudId });
  } else if (action === 'login') emit({ type: 'login', url: (await call('POST', '/api/cloud/login')).url, message: 'Open url to sign in to the Ryugi cloud.' });
  else if (action === 'logout') {
    await call('POST', '/api/cloud/logout');
    emit({ type: 'logged-out' });
  } else if (action === 'unpublish') {
    await call('DELETE', `/api/cloud/publish/${artifact}`);
    emit({ type: 'unpublished', artifact });
  } else {
    const published = await call('POST', `/api/cloud/publish/${artifact}`, options.visibility ? { visibility: options.visibility } : undefined);
    emit({ type: 'published', artifact, url: published.url, visibility: published.visibility });
  }
  return 0;
}
