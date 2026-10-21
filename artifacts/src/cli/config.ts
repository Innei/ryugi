import os from 'node:os';
import path from 'node:path';
import { ensureConfig, readConfig, setProjectAutoPublish } from '../server/config';
import { credentialsFile } from '../server/credentials';
import { readGlobalAutoPublish, settingsFileFor, writeGlobalAutoPublish } from '../server/settings';
import { CliError, projectPaths } from './paths';
import type { Emit } from './start';

export interface ConfigOptions {
  projectDir: string;
  autoPublish?: string;
  project: boolean;
}

const VALUES: Record<string, boolean | null> = { on: true, off: false, inherit: null };

export function config(options: ConfigOptions, emit: Emit): number {
  const globalFile = settingsFileFor(credentialsFile(process.env, process.platform, os.homedir()));
  const projectFile = path.join(path.dirname(projectPaths(options.projectDir).root), 'config.json');
  if (options.autoPublish !== undefined) {
    const value = VALUES[options.autoPublish];
    if (value === undefined) throw new CliError('--auto-publish takes on, off, or (with --project) inherit');
    if (options.project) {
      ensureConfig(projectFile);
      setProjectAutoPublish(projectFile, value);
    } else if (value === null) throw new CliError('inherit only applies with --project');
    else writeGlobalAutoPublish(globalFile, value);
  }
  emit({ type: 'auto-publish', global: readGlobalAutoPublish(globalFile) ?? null, project: readConfig(projectFile).config.autoPublish ?? null });
  return 0;
}
