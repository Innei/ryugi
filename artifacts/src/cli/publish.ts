import { cloudErrorDetails } from '../shared/cloud-error';
import type { CommandSpec } from './command';
import { ARTIFACT_ERROR, ARTIFACT_PATTERN, CliError } from './paths';
import { serverClient } from './server';
import type { Emit } from './start';

export type PublishAction = 'publish' | 'unpublish' | 'list' | 'delete' | 'login' | 'logout';

export interface PublishOptions {
  projectDir: string;
  action: PublishAction;
  artifact?: string;
  visibility?: 'public' | 'private';
  cloudId?: string;
}

export async function publish(options: PublishOptions, emit: Emit): Promise<number> {
  if (options.action === 'publish' || options.action === 'unpublish') {
    if (!options.artifact) throw new CliError('--artifact <type>/<id> is required');
    if (!ARTIFACT_PATTERN.test(options.artifact)) throw new CliError(ARTIFACT_ERROR);
  }
  if (options.action === 'delete' && !/^[A-Za-z0-9_-]{1,64}$/.test(options.cloudId ?? '')) throw new CliError('--delete needs a cloud artifact id from --list');
  const server = serverClient(options.projectDir);
  const call = async (method: string, route: string, body?: unknown) => {
    const { status, json } = await server.call(method, route, body);
    if (status === 401) throw new CliError('', { type: 'login-required', url: json.loginUrl, message: 'Open url to sign in to the Ryugi cloud, then run the same command again.' }, 2);
    const details = cloudErrorDetails(json);
    if (status === 402 && details.code === 'plan_limit') throw new CliError('', { type: 'plan-limit', message: json.error, status, ...details }, 2);
    if (status < 200 || status >= 300) throw new CliError(json.error || `HTTP ${status}`, { status, ...details, ...(json.reasons ? { reasons: json.reasons } : {}) });
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

const ACTIONS = ['unpublish', 'list', 'delete', 'login', 'logout'] as const;

export const publishCommand: CommandSpec = {
  name: 'publish',
  summary: 'Publish an artifact to the Ryugi cloud (needs a running server)',
  usage: [
    '--artifact <type>/<id> [--public | --private] [--unpublish] [options]',
    '--list | --delete <cloud-id> | --login | --logout [options]',
  ],
  options: {
    artifact: { type: 'string', value: '<type>/<id>', help: 'The artifact to publish or unpublish' },
    public: { type: 'boolean', help: 'Anyone with the link can open it' },
    private: { type: 'boolean', help: 'Only you can open it' },
    unpublish: { type: 'boolean', help: 'Remove the artifact\'s cloud copy' },
    list: { type: 'boolean', help: 'List your cloud artifacts' },
    delete: { type: 'string', value: '<cloud-id>', help: 'Delete a cloud artifact by its id from --list' },
    login: { type: 'boolean', help: 'Sign in to the Ryugi cloud' },
    logout: { type: 'boolean', help: 'Sign out of the Ryugi cloud' },
  },
  run: ({ values, projectDir }, emit) => {
    const actions = ACTIONS.filter((name) => values[name] !== undefined && values[name] !== false);
    if (actions.length > 1) throw new CliError(`Choose one of --${actions.join(', --')}`);
    return publish({
      projectDir,
      action: actions[0] ?? 'publish',
      artifact: values.artifact as string | undefined,
      visibility: values.public ? 'public' : values.private ? 'private' : undefined,
      cloudId: values.delete as string | undefined,
    }, emit);
  },
  text: (value) => {
    if (value.type === 'login-required' || value.type === 'login') return `${value.message}\n${value.url}`;
    if (value.type === 'published') return `${value.url} (${value.visibility})`;
    return null;
  },
};
