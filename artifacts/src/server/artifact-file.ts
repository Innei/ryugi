import fs from 'node:fs';

import type { ArtifactType } from '../shared/types';
import { mimeOf } from './http';
import { injectRuntime } from './inject';
import { resolveBoardFile, resolveDocumentAsset, resolveHtmlFile, resolveInside } from './paths';

const RESOLVE = {
  artboard: resolveBoardFile,
  document: resolveDocumentAsset,
  html: resolveHtmlFile,
};

export const isArtifactPage = (type: ArtifactType, relative: string) =>
  type === 'html' ? relative === 'index.html' : relative.endsWith('.html');

export function readArtifactFile(
  dir: string,
  type: ArtifactType,
  relative: string,
  uiRuntimeUrl: string,
  maxBytes = Infinity,
  preparedFile?: string | null,
) {
  if (!resolveInside(dir, relative)) return null;
  const target = preparedFile ?? RESOLVE[type](dir, relative);
  if (!target) return null;
  let data: Buffer;
  try {
    if (fs.statSync(target).size > maxBytes) throw new RangeError('too large');
    data = fs.readFileSync(target);
  } catch (err) {
    if (err instanceof RangeError) throw err;
    return null;
  }
  if (!isArtifactPage(type, relative)) return { contentType: mimeOf(target), data };
  const page = injectRuntime(data.toString('utf8'), {
    uiRuntimeUrl,
    embedded: type === 'document',
    inspector: type === 'artboard',
  });
  return { contentType: 'text/html; charset=utf-8', data: Buffer.from(page) };
}
