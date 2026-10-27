import fs from 'node:fs';
import path from 'node:path';

import {
  type ArtifactConfig,
  type CloudRecord,
  isVisibility,
  type Visibility,
} from '../shared/cloud';
import { writeJsonAtomic } from './state';

export type { ArtifactConfig, CloudRecord, Visibility };

export interface RyugiConfig {
  artifacts: Record<string, ArtifactConfig>;
  autoPublish?: boolean;
  version: 1;
}

export interface ArtifactConfigPatch {
  autoPublish?: false | null;
  cloud?: CloudRecord | null;
  visibility?: Visibility;
}

const defaults = (): RyugiConfig => ({ version: 1, artifacts: {} });

function isCloudRecord(value: unknown): value is CloudRecord {
  if (typeof value !== 'object' || value === null) return false;
  const { id, url, publishedAt, visibility } = value as Record<string, unknown>;
  return (
    typeof id === 'string' &&
    typeof url === 'string' &&
    (typeof publishedAt === 'string' || publishedAt === null) &&
    isVisibility(visibility)
  );
}

function cloudRecord({ id, url, publishedAt, visibility, fingerprint }: CloudRecord): CloudRecord {
  return {
    id,
    url,
    publishedAt,
    visibility,
    ...(typeof fingerprint === 'string' ? { fingerprint } : {}),
  };
}

function normalize(raw: unknown): RyugiConfig {
  const config = defaults();
  if (typeof raw !== 'object' || raw === null) return config;
  const { autoPublish } = raw as Record<string, unknown>;
  if (typeof autoPublish === 'boolean') config.autoPublish = autoPublish;
  const artifacts = (raw as Record<string, unknown>).artifacts;
  if (typeof artifacts !== 'object' || artifacts === null) return config;
  for (const [key, value] of Object.entries(artifacts)) {
    if (typeof value !== 'object' || value === null) continue;
    const { visibility, cloud, autoPublish } = value as Record<string, unknown>;
    if (visibility !== undefined && !isVisibility(visibility)) continue;
    const entry: ArtifactConfig = {};
    if (visibility) entry.visibility = visibility;
    if (isCloudRecord(cloud)) entry.cloud = cloudRecord(cloud);
    if (autoPublish === false) entry.autoPublish = false;
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
    return {
      config: defaults(),
      warning: `config.json is not valid JSON: ${(err as Error).message}`,
    };
  }
}

const IGNORED = [
  'config.json',
  'artifacts/*',
  '!artifacts/document/',
  'artifacts/document/*/.artifact-id',
];

function ensureGitignore(dir: string) {
  const file = path.join(dir, '.gitignore');
  let current = '';
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch {}
  const present = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = IGNORED.filter((line) => !present.has(line));
  if (missing.length === 0) return;
  fs.writeFileSync(
    file,
    `${current}${current === '' || current.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`,
  );
}

export function ensureConfig(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  ensureGitignore(path.dirname(file));
  if (!fs.existsSync(file)) writeJsonAtomic(file, defaults());
}

export function updateArtifactConfig(
  file: string,
  key: string,
  patch: ArtifactConfigPatch,
): ArtifactConfig {
  const { config, warning } = readConfig(file);
  if (warning) throw new Error(warning);
  const entry: ArtifactConfig = { ...config.artifacts[key] };
  if (patch.visibility) entry.visibility = patch.visibility;
  if (patch.cloud === null) delete entry.cloud;
  else if (patch.cloud) entry.cloud = patch.cloud;
  if (patch.autoPublish === null) delete entry.autoPublish;
  else if (patch.autoPublish === false) entry.autoPublish = false;
  config.artifacts[key] = entry;
  writeJsonAtomic(file, config);
  return entry;
}

export function setProjectAutoPublish(file: string, value: boolean | null) {
  const { config, warning } = readConfig(file);
  if (warning) throw new Error(warning);
  if (value === null) delete config.autoPublish;
  else config.autoPublish = value;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonAtomic(file, config);
}
