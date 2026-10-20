import fs from 'node:fs';
import path from 'node:path';
import { isVisibility, type ArtifactConfig, type CloudRecord, type Visibility } from '../shared/cloud';
import { writeJsonAtomic } from './state';

export type { ArtifactConfig, CloudRecord, Visibility };

export interface RyugiConfig {
  version: 1;
  artifacts: Record<string, ArtifactConfig>;
}

export interface ArtifactConfigPatch {
  visibility?: Visibility;
  cloud?: CloudRecord | null;
}

const defaults = (): RyugiConfig => ({ version: 1, artifacts: {} });

function isCloudRecord(value: unknown): value is CloudRecord {
  if (typeof value !== 'object' || value === null) return false;
  const { id, url, publishedAt, visibility } = value as Record<string, unknown>;
  return typeof id === 'string' && typeof url === 'string' && (typeof publishedAt === 'string' || publishedAt === null) && isVisibility(visibility);
}

function normalize(raw: unknown): RyugiConfig {
  const config = defaults();
  if (typeof raw !== 'object' || raw === null) return config;
  const artifacts = (raw as Record<string, unknown>).artifacts;
  if (typeof artifacts !== 'object' || artifacts === null) return config;
  for (const [key, value] of Object.entries(artifacts)) {
    if (typeof value !== 'object' || value === null) continue;
    const { visibility, cloud } = value as Record<string, unknown>;
    if (visibility !== undefined && !isVisibility(visibility)) continue;
    const entry: ArtifactConfig = {};
    if (visibility) entry.visibility = visibility;
    if (isCloudRecord(cloud)) entry.cloud = { id: cloud.id, url: cloud.url, publishedAt: cloud.publishedAt, visibility: cloud.visibility };
    config.artifacts[key] = entry;
  }
  return config;
}

export function readConfig(file: string): { config: RyugiConfig; warning?: string } {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { config: defaults() };
  }
  try {
    return { config: normalize(JSON.parse(text)) };
  } catch (err) {
    return { config: defaults(), warning: `config.json is not valid JSON: ${(err as Error).message}` };
  }
}

function ensureGitignore(dir: string) {
  const file = path.join(dir, '.gitignore');
  let current = '';
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch {
    fs.writeFileSync(file, 'config.json\n');
    return;
  }
  if (current.split(/\r?\n/).some((line) => line.trim() === 'config.json')) return;
  fs.writeFileSync(file, `${current}${current === '' || current.endsWith('\n') ? '' : '\n'}config.json\n`);
}

export function ensureConfig(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  ensureGitignore(path.dirname(file));
  if (!fs.existsSync(file)) writeJsonAtomic(file, defaults());
}

export function updateArtifactConfig(file: string, key: string, patch: ArtifactConfigPatch): ArtifactConfig {
  const { config, warning } = readConfig(file);
  if (warning) throw new Error(warning);
  const entry: ArtifactConfig = { ...config.artifacts[key] };
  if (patch.visibility) entry.visibility = patch.visibility;
  if (patch.cloud === null) delete entry.cloud;
  else if (patch.cloud) entry.cloud = patch.cloud;
  config.artifacts[key] = entry;
  writeJsonAtomic(file, config);
  return entry;
}
