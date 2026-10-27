import os from 'node:os';
import path from 'node:path';

import { ensureConfig, readConfig, setProjectAutoPublish } from '../server/config';
import { credentialsFile } from '../server/credentials';
import { readGlobalAutoPublish, settingsFileFor, writeGlobalAutoPublish } from '../server/settings';
import type { CommandSpec } from './command';
import { CliError, projectPaths } from './paths';
import type { Emit } from './start';

export interface ConfigOptions {
  autoPublish?: string;
  project: boolean;
  projectDir: string;
}

const VALUES: Record<string, boolean | null> = { on: true, off: false, inherit: null };

export function config(options: ConfigOptions, emit: Emit): number {
  const globalFile = settingsFileFor(credentialsFile(process.env, process.platform, os.homedir()));
  const projectFile = path.join(path.dirname(projectPaths(options.projectDir).root), 'config.json');
  if (options.autoPublish !== undefined) {
    const value = VALUES[options.autoPublish];
    if (value === undefined)
      throw new CliError('--auto-publish takes on, off, or (with --project) inherit');
    if (options.project) {
      ensureConfig(projectFile);
      setProjectAutoPublish(projectFile, value);
    } else if (value === null) throw new CliError('inherit only applies with --project');
    else writeGlobalAutoPublish(globalFile, value);
  }
  emit({
    type: 'auto-publish',
    global: readGlobalAutoPublish(globalFile) ?? null,
    project: readConfig(projectFile).config.autoPublish ?? null,
  });
  return 0;
}

export const configCommand: CommandSpec = {
  name: 'config',
  summary: "Auto-publish changed artifacts as private cloud copies when the agent's turn ends",
  usage: ['[--auto-publish on|off] [options]', '--auto-publish on|off|inherit --project [options]'],
  details: 'Without --auto-publish, prints the current values.',
  options: {
    'auto-publish': {
      type: 'string',
      value: 'on|off|inherit',
      help: 'Turn auto-publish on or off; inherit (with --project) drops the override',
    },
    'project': { type: 'boolean', help: 'Set it for this project only instead of every project' },
  },
  run: ({ values, projectDir }, emit) =>
    config(
      {
        projectDir,
        autoPublish: values['auto-publish'] as string | undefined,
        project: !!values.project,
      },
      emit,
    ),
  text: (value) =>
    value.type === 'auto-publish'
      ? `Auto-publish: ${value.global === null ? 'not decided' : value.global ? 'on' : 'off'} for every project${value.project === null ? '' : `, ${value.project ? 'on' : 'off'} for this project`}.`
      : null,
};
