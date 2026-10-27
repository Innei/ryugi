import fs from 'node:fs';
import path from 'node:path';

import type { HtmlPayload } from '../shared/types';

const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;

export function latestMtime(dir: string): number {
  let latest = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return latest;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    try {
      latest = Math.max(
        latest,
        entry.isDirectory() ? latestMtime(full) : fs.statSync(full).mtimeMs,
      );
    } catch {
      continue;
    }
  }
  return latest;
}

export function readHtml(dir: string, id: string): HtmlPayload {
  let source: string;
  try {
    source = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  } catch {
    return { title: id, warnings: ['index.html not found'], version: latestMtime(dir) };
  }
  const title = TITLE.exec(source)?.[1]?.trim();
  return { title: title || id, warnings: [], version: latestMtime(dir) };
}
