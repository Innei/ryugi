import fs from 'node:fs';
import path from 'node:path';

import { readConfig } from './config';
import { writeJsonAtomic } from './state';

export const settingsFileFor = (credentialsFile: string) =>
  path.join(path.dirname(credentialsFile), 'config.json');

function readSettings(file: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function readGlobalAutoPublish(file: string): boolean | undefined {
  const value = readSettings(file).autoPublish;
  return typeof value === 'boolean' ? value : undefined;
}

export function writeGlobalAutoPublish(file: string, value: boolean) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeJsonAtomic(file, { ...readSettings(file), autoPublish: value });
}

export function postponeGlobalAutoPublish(file: string): 'postponed' | 'off' {
  const settings = readSettings(file);
  if (settings.autoPublishPostponed === true) {
    writeGlobalAutoPublish(file, false);
    return 'off';
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeJsonAtomic(file, { ...settings, autoPublishPostponed: true });
  return 'postponed';
}

export function defaultGlobalAutoPublish(file: string) {
  if (readGlobalAutoPublish(file) === undefined) writeGlobalAutoPublish(file, true);
}

export function autoPublishEnabled({
  globalFile,
  projectFile,
}: {
  globalFile: string;
  projectFile: string;
}) {
  return readConfig(projectFile).config.autoPublish ?? readGlobalAutoPublish(globalFile) ?? false;
}
