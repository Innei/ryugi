import fs from 'node:fs';
import path from 'node:path';
import { emptyComments, type CommentsFile } from '../shared/comments';
import type { CanvasPayload } from '../shared/types';
import type { ArtifactRef } from './artifacts';
import { parseDocument } from './document-codec';
import { injectRuntime } from './inject';
import type { PackedFile } from './pack';

export const CLOUD_RUNTIME_URL = '/_ryugi/runtime/ryugi-ui.js';

// The cloud viewer's CSP blocks avatar hosts, and a Gravatar URL carries a hash of the email.
function sharedComments(file: CommentsFile): CommentsFile {
  return {
    version: 1,
    threads: file.threads
      .filter((thread) => !thread.messages.every((m) => m.deleted))
      .map((thread) => ({ ...thread, messages: thread.messages.map(({ avatar: _avatar, ...message }) => message) })),
  };
}

export function publishPayload(ref: ArtifactRef, dir: string, title: string, payload: unknown, comments = emptyComments()): Record<string, unknown> {
  if (ref.type === 'artboard') {
    const { canvas, layout, versions } = payload as CanvasPayload;
    return { canvas, layout, versions, snapshots: true };
  }
  if (ref.type === 'document') return { title, state: parseDocument(fs.readFileSync(path.join(dir, 'doc.xml'), 'utf8')), comments: sharedComments(comments) };
  return { title };
}

const isPage = (type: ArtifactRef['type'], file: string) =>
  type === 'html' ? file === 'index.html' : (type === 'document' || type === 'artboard') && file.endsWith('.html');

export function withCloudRuntime(type: ArtifactRef['type'], files: PackedFile[]): PackedFile[] {
  return files.map((file) =>
    isPage(type, file.path)
      ? { path: file.path, data: Buffer.from(injectRuntime(file.data.toString('utf8'), { uiRuntimeUrl: CLOUD_RUNTIME_URL, embedded: type === 'document', inspector: type === 'artboard' })) }
      : file,
  );
}
