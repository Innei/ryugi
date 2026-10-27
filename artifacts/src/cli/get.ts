import fs from 'node:fs';
import path from 'node:path';
import type { SerializedEditorState } from 'lexical';
import { readCredentials } from '../server/credentials';
import { serializeDocument } from '../server/document-codec';
import { cloudErrorDetails } from '../shared/cloud-error';
import type { Thread } from '../shared/comments';
import { CliError } from './paths';

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const LINK_PATH = /^\/a\/([A-Za-z0-9_-]{1,64})(?:\/(?:view|preview))?\/?$/;
const TARGET_ERROR = 'Expected a Ryugi Cloud link (https://<host>/a/<id>) or an artifact id.';
const LOGIN_MESSAGE = 'Not found, or private and you are not signed in. Sign in once with `ryugi-artifacts start` then `ryugi-artifacts publish --login` in any project, then run this command again.';

export interface GetOptions {
  target: string;
  defaultOrigin: string;
  credentialsFile: string;
  cacheRoot: string;
  out?: string;
}

export interface GetResult {
  type: 'artifact';
  artifactType: string;
  id: string;
  title: string | null;
  visibility: string;
  updatedAt: string;
  content?: string;
  comments?: Thread[];
  dir?: string;
  files?: string[];
}

const safePath = (file: string) =>
  !file.includes('\\') && !file.includes('\0') && !path.posix.isAbsolute(file) && file.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

async function download(contentBase: string, files: string[], dir: string, fresh: boolean) {
  const unsafe = files.find((file) => !safePath(file));
  if (unsafe !== undefined) throw new CliError(`Refusing to write ${unsafe}: it is not a path inside the download directory.`);
  if (fresh) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const file of files) {
    const res = await fetch(`${contentBase}${file.split('/').map(encodeURIComponent).join('/')}`).catch((err: Error) => {
      throw new CliError(`Could not download ${file}: ${err.message}`);
    });
    if (!res.ok) throw new CliError(`Could not download ${file}: HTTP ${res.status}`);
    const target = path.join(dir, ...file.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
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
  if (!id || (url.protocol !== 'https:' && url.protocol !== 'http:')) throw new CliError(TARGET_ERROR);
  return { origin: url.origin, id };
}

export async function getArtifact({ target, defaultOrigin, credentialsFile, cacheRoot, out }: GetOptions): Promise<GetResult> {
  const { origin, id } = parseTarget(target, defaultOrigin);
  const credentials = readCredentials(credentialsFile, origin);
  let res: Response;
  try {
    res = await fetch(`${origin}/api/a/${id}`, { headers: credentials ? { Authorization: `Bearer ${credentials.token}` } : {} });
  } catch (err) {
    throw new CliError(`Could not reach ${origin}: ${(err as Error).message}`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (res.status === 404 && !credentials) throw new CliError('', { type: 'login-required', message: LOGIN_MESSAGE }, 2);
  if (res.status === 404) throw new CliError('Artifact not found or no access.', { status: 404, ...cloudErrorDetails(json) });
  if (!res.ok) throw new CliError(typeof json.error === 'string' ? json.error : `HTTP ${res.status}`, { status: res.status, ...cloudErrorDetails(json) });
  if (!json.published) throw new CliError('This artifact is not published yet.');
  const result: GetResult = { type: 'artifact', artifactType: json.type, id, title: json.title ?? null, visibility: json.visibility, updatedAt: json.updatedAt };
  const files = ((json.files ?? []) as string[]).filter((file) => json.type !== 'document' || file !== 'doc.xml');
  const dir = out ? path.resolve(out) : path.join(cacheRoot, id);
  if (json.type === 'document') {
    result.content = serializeDocument(json.payload.state as SerializedEditorState);
    result.comments = (json.payload.comments?.threads ?? []) as Thread[];
    if (!files.length) return result;
  }
  await download(json.contentBase, files, dir, !out);
  result.dir = dir;
  result.files = files;
  if (json.type === 'artboard') {
    fs.writeFileSync(path.join(dir, 'canvas.json'), `${JSON.stringify(json.payload.canvas, null, 2)}\n`);
    result.files = ['canvas.json', ...files];
  }
  return result;
}

function threadText(thread: Thread) {
  const messages = thread.messages.filter((message) => !message.deleted);
  if (!messages.length) return null;
  const head = `[${thread.anchor.blockId}] "${thread.anchor.quote}"${thread.status === 'resolved' ? ' (resolved)' : ''}`;
  return [head, ...messages.map((message) => `  ${message.name ?? message.author}: ${message.text.replace(/\n/g, '\n    ')}`)].join('\n');
}

export function getText(result: GetResult, { comments }: { comments: boolean }) {
  if (result.content === undefined) return `${[result.dir, ...(result.files ?? [])].join('\n')}\n`;
  const parts = [result.dir ? `Files: ${result.dir}\n${result.content}` : result.content];
  const threads = comments ? (result.comments ?? []).map(threadText).filter((text) => text !== null) : [];
  if (threads.length) parts.push(`\nComments\n\n${threads.join('\n\n')}\n`);
  return parts.join('');
}
