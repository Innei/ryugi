import type { CommandSpec } from './command';
import { ARTIFACT_ERROR, ARTIFACT_PATTERN, CliError, invocation } from './paths';
import { serverClient } from './server';
import type { Emit } from './start';

export interface CheckOptions {
  artifact?: string;
  projectDir: string;
}

export async function check(options: CheckOptions, emit: Emit): Promise<number> {
  if (!options.artifact || !ARTIFACT_PATTERN.test(options.artifact))
    throw new CliError(ARTIFACT_ERROR);
  const server = serverClient(options.projectDir);
  const { status, json } = await server.call('POST', `/api/agent/${options.artifact}/check`);
  if (status === 404 && typeof json.error !== 'string') {
    throw new CliError(
      `The running artifacts server is older than this CLI. Run \`${invocation()} start --project-dir ${server.project}\` to replace it, then run this again.`,
    );
  }
  if (status < 200 || status >= 300) throw new CliError(json.error || `HTTP ${status}`);
  emit({ type: 'checked', artifact: options.artifact, ...json });
  return 0;
}

export function checkText(value: Record<string, unknown>): string | null {
  if (value.type !== 'checked') return null;
  const warnings = (value.warnings as string[] | undefined) ?? [];
  const pending = (value.pending as string[] | undefined) ?? [];
  const dynamic = (value.dynamic as Record<string, { ran?: boolean }> | undefined) ?? {};
  const recordings = (value.recordings as Record<string, { warning?: string }> | undefined) ?? {};
  const unrun = Object.entries(dynamic)
    .filter(([, block]) => block.ran === false)
    .map(([file]) => file);
  const lines = [
    ...warnings.map((warning) => `warning: ${warning}`),
    ...Object.entries(recordings).flatMap(([board, state]) =>
      state.warning ? [`warning: recording ${board}: ${state.warning}`] : [],
    ),
    ...(pending.length ? [`pending: ${pending.join(', ')}`] : []),
    ...(value.merging ? ['still merging the last edit; check again'] : []),
    ...(value.ran === false ? ['not run in a browser yet'] : []),
    ...(unrun.length ? [`not run in a browser yet: ${unrun.join(', ')}`] : []),
  ];
  return lines.length ? `${value.artifact}\n${lines.join('\n')}` : `${value.artifact}: no warnings`;
}

export const checkCommand: CommandSpec = {
  name: 'check',
  summary:
    'Wait until the server has checked the latest write, then print its warnings (needs a running server)',
  usage: ['--artifact <type>/<id> [options]'],
  options: {
    artifact: { type: 'string', value: '<type>/<id>', help: 'The artifact to check' },
  },
  run: ({ values, projectDir }, emit) =>
    check({ projectDir, artifact: values.artifact as string | undefined }, emit),
  text: checkText,
};
