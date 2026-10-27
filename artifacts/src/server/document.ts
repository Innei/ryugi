import fs from 'node:fs';
import path from 'node:path';
import type { DocumentPayload } from '../shared/types';
import { latestMtime } from './html';

const FIRST_HEADING = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i;

export function readDocument(dir: string, id: string): DocumentPayload {
  let source: string;
  try {
    source = fs.readFileSync(path.join(dir, 'doc.xml'), 'utf8');
  } catch {
    return { title: id, warnings: ['doc.xml not found'], version: latestMtime(dir) };
  }
  const heading = FIRST_HEADING.exec(source)?.[1]
    ?.replace(/<[^>]+>/g, '')
    .trim();
  return { title: heading || id, warnings: [], version: latestMtime(dir) };
}
