import fs from 'node:fs';
import path from 'node:path';
import type { CanvasPayload } from '../shared/types';
import type { ArtifactRef } from './artifacts';
import { parseDocument } from './document-codec';
import { injectRuntime } from './inject';
import type { PackedFile } from './pack';

export const CLOUD_RUNTIME_URL = '/_ryugi/runtime/ryugi-ui.js';

export function publishPayload(ref: ArtifactRef, dir: string, title: string, payload: unknown): Record<string, unknown> {
  if (ref.type === 'artboard') {
    const { canvas, layout, versions } = payload as CanvasPayload;
    return { canvas, layout, versions };
  }
  if (ref.type === 'document') return { title, state: parseDocument(fs.readFileSync(path.join(dir, 'doc.xml'), 'utf8')) };
  return { title };
}

const isPage = (type: ArtifactRef['type'], file: string) =>
  type === 'html' ? file === 'index.html' : type === 'document' && file.endsWith('.html');

export function withCloudRuntime(type: ArtifactRef['type'], files: PackedFile[]): PackedFile[] {
  return files.map((file) =>
    isPage(type, file.path)
      ? { path: file.path, data: Buffer.from(injectRuntime(file.data.toString('utf8'), { uiRuntimeUrl: CLOUD_RUNTIME_URL, embedded: type === 'document' })) }
      : file,
  );
}
