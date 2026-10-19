import fs from 'node:fs';
import path from 'node:path';

export function viewerCdnFor(appDir: string) {
  const { version } = JSON.parse(fs.readFileSync(path.join(appDir, 'version.json'), 'utf8')) as { version: string };
  return `https://cdn.jsdelivr.net/npm/ryugi-artifacts@${version}/dist/viewer/`;
}
