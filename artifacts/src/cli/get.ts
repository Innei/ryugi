import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { SerializedEditorState } from 'lexical';

import { credentialsFile, readCredentials } from '../server/credentials';
import { serializeDocument } from '../server/document-codec';
import { stripRuntime } from '../server/strip-runtime';
import { cloudErrorDetails } from '../shared/cloud-error';
import type { Thread } from '../shared/comments';
import type { CommandSpec } from './command';
import { CliError } from './paths';

const ID = /^[\w-]{1,64}$/;
const LINK_PATH = /^\/a\/([\w-]{1,64})(?:\/(?:view|preview))?\/?$/;
const TARGET_ERROR = 'Expected a Ryugi Cloud link (https://<host>/a/<id>) or an artifact id.';
const LOGIN_MESSAGE =
  'Not found, or private and you are not signed in. Sign in once with `ryugi-artifacts start` then `ryugi-artifacts publish --login` in any project, then run this command again.';

export interface GetOptions {
  cacheRoot: string;
  credentialsFile: string;
  defaultOrigin: string;
  out?: string;
  target: string;
}

export interface GetResult {
  artifactType: string;
  comments?: Thread[];
  content?: string;
  dir?: string;
  files?: string[];
  id: string;
  title: string | null;
  type: 'artifact';
  updatedAt: string;
  visibility: string;
}

const safePath = (file: string) =>
  !file.includes('\\') &&
  !file.includes('\0') &&
  !path.posix.isAbsolute(file) &&
  file.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

async function download(contentBase: string, files: string[], dir: string, fresh: boolean) {
  const unsafe = files.find((file) => !safePath(file));
  if (unsafe !== undefined)
    throw new CliError(
      `Refusing to write ${unsafe}: it is not a path inside the download directory.`,
    );
  if (fresh) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) {
    const res = await fetch(
      `${contentBase}${file.split('/').map(encodeURIComponent).join('/')}`,
    ).catch((err: Error) => {
      throw new CliError(`Could not download ${file}: ${err.message}`);
    });
    if (!res.ok) throw new CliError(`Could not download ${file}: HTTP ${res.status}`);
    const target = path.join(dir, ...file.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const data = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(target, file.endsWith('.html') ? stripRuntime(data.toString('utf8')) : data);
  }
}

export function parseTarget(target: string, defaultOrigin: string) {
  if (ID.test(target)) return { origin: defaultOrigin, id: target };
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new CliError(TARGET_ERROR);
  }
  const id = LINK_PATH.exec(url.pathname)?.[1];
  if (!id || (url.protocol !== 'https:' && url.protocol !== 'http:'))
    throw new CliError(TARGET_ERROR);
  return { origin: url.origin, id };
}

export async function getArtifact({
  target,
  defaultOrigin,
  credentialsFile,
  cacheRoot,
  out,
}: GetOptions): Promise<GetResult> {
  const { origin, id } = parseTarget(target, defaultOrigin);
  const credentials = readCredentials(credentialsFile, origin);
  let res: Response;
  try {
    res = await fetch(`${origin}/api/a/${id}`, {
      headers: credentials ? { Authorization: `Bearer ${credentials.token}` } : {},
    });
  } catch (err) {
    throw new CliError(`Could not reach ${origin}: ${(err as Error).message}`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (res.status === 404 && !credentials)
    throw new CliError('', { type: 'login-required', message: LOGIN_MESSAGE }, 2);
  if (res.status === 404)
    throw new CliError('Artifact not found or no access.', {
      status: 404,
      ...cloudErrorDetails(json),
    });
  if (!res.ok)
    throw new CliError(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`, {
      status: res.status,
      ...cloudErrorDetails(json),
    });
  if (!json.published) throw new CliError('This artifact is not published yet.');
  const result: GetResult = {
    type: 'artifact',
    artifactType: json.type,
    id,
    title: json.title ?? null,
    visibility: json.visibility,
    updatedAt: json.updatedAt,
  };
  const files = ((json.files ?? []) as string[]).filter(
    (file) => json.type !== 'document' || file !== 'doc.xml',
  );
  const dir = out ? path.resolve(out) : path.join(cacheRoot, id);
  if (json.type === 'document') {
    result.content = serializeDocument(json.payload.state as SerializedEditorState);
    result.comments = (json.payload.comments?.threads ?? []) as Thread[];
    if (!files.length) return result;
  }
  await download(json.contentBase, files, dir, !out);
  result.dir = dir;
  result.files = files;
  if (json.type === 'artboard' && !files.includes('canvas.json')) {
    fs.writeFileSync(
      path.join(dir, 'canvas.json'),
      `${JSON.stringify(json.payload.canvas, null, 2)}\n`,
    );
    result.files = ['canvas.json', ...files];
  }
  return result;
}

function threadText(thread: Thread) {
  const messages = thread.messages.filter((message) => !message.deleted);
  if (!messages.length) return null;
  const head = `[${(thread.anchor.blockIds ?? [thread.anchor.blockId]).join(', ')}] "${thread.anchor.quote}"${thread.status === 'resolved' ? ' (resolved)' : ''}`;
  return [
    head,
    ...messages.map(
      (message) =>
        `  ${message.name ?? message.author}: ${message.text.replaceAll('\n', '\n    ')}`,
    ),
  ].join('\n');
}

export function getText(result: GetResult, { comments }: { comments: boolean }) {
  if (result.content === undefined) return `${[result.dir, ...(result.files ?? [])].join('\n')}\n`;
  const parts = [result.dir ? `Files: ${result.dir}\n${result.content}` : result.content];
  const threads = comments
    ? (result.comments ?? []).map(threadText).filter((text) => text !== null)
    : [];
  if (threads.length) parts.push(`\nComments\n\n${threads.join('\n\n')}\n`);
  return parts.join('');
}

export const getCommand: CommandSpec = {
  name: 'get',
  summary:
    "Read a published Ryugi Cloud artifact by link or id, signed in as this machine's cloud account",
  usage: ['<link-or-id> [--out <dir>] [--no-comments] [options]'],
  details:
    "Prints the source (a document's LiteXML and comments) unless --json; artboard and HTML files, and files a document uses, are downloaded to --out or ~/.cache/ryugi/get/<id>/.",
  options: {
    'out': {
      type: 'string',
      value: '<dir>',
      help: 'Download files here instead of ~/.cache/ryugi/get/<id>/',
    },
    'no-comments': { type: 'boolean', help: "Leave a document's comments out" },
  },
  positionals: 1,
  // Agents run commands without a TTY and the signpost's command has no --json, so get prints the source unless --json is explicit.
  explicitJson: true,
  run: async ({ values, positionals }) => {
    const json = !!values.json;
    try {
      if (!positionals[0]) throw new CliError('Give a Ryugi Cloud link or artifact id.');
      const result = await getArtifact({
        target: positionals[0],
        defaultOrigin: (process.env.RYUGI_CLOUD_ORIGIN || 'https://ryugi.innei.dev').replace(
          /\/+$/,
          '',
        ),
        credentialsFile: credentialsFile(process.env, process.platform, os.homedir()),
        cacheRoot: path.join(
          process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
          'ryugi',
          'get',
        ),
        out: values.out as string | undefined,
      });
      if (json) console.info(JSON.stringify(result));
      else process.stdout.write(getText(result, { comments: !values['no-comments'] }));
      return 0;
    } catch (caught) {
      const err = caught instanceof CliError ? caught : new CliError((caught as Error).message);
      const fields = err.message ? { error: err.message, ...err.fields } : err.fields;
      if (json) console.info(JSON.stringify(fields));
      else console.error(err.message ? `Error: ${err.message}` : String(err.fields.message));
      return err.code;
    }
  },
};
