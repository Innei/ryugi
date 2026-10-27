import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import type { CommandSpec } from './command';
import { CliError } from './paths';
import type { Emit } from './start';
import { latestFile, newer, writeLatest } from './update-hint';

declare const CLI_VERSION: string;

const PACKAGE = 'ryugi-artifacts';
const PMS = ['npm', 'pnpm', 'yarn', 'bun'] as const;
export type Pm = (typeof PMS)[number];

export type Install =
  | { kind: 'global'; pm: Pm }
  | { kind: 'transient'; runner: 'npx' | 'pnpm dlx' | 'bunx' }
  | { kind: 'local' }
  | { kind: 'launcher' }
  | { kind: 'unknown' };

const TRANSIENT: [Extract<Install, { kind: 'transient' }>['runner'], string[]][] = [
  ['npx', ['/_npx/']],
  ['pnpm dlx', ['/pnpm/dlx/', '/.pnpm-store/dlx/']],
  ['bunx', ['/bunx-', '/.bun/install/cache/']],
];

const GLOBAL: [Pm, string[]][] = [
  ['pnpm', ['/pnpm/global/']],
  ['yarn', ['/yarn/global/']],
  ['bun', ['/.bun/install/global/']],
  ['npm', [`/lib/node_modules/${PACKAGE}/`, `/npm/node_modules/${PACKAGE}/`]],
];

export function detectInstall(file: string, env: NodeJS.ProcessEnv): Install {
  if (env.RYUGI_ARTIFACTS_COMMAND) return { kind: 'launcher' };
  let real = file;
  try { real = fs.realpathSync(file); } catch {}
  const normalized = real.replace(/\\/g, '/').toLowerCase();
  const has = (markers: string[]) => markers.some((marker) => normalized.includes(marker));
  for (const [runner, markers] of TRANSIENT) if (has(markers)) return { kind: 'transient', runner };
  for (const [pm, markers] of GLOBAL) if (has(markers)) return { kind: 'global', pm };
  return normalized.includes('/node_modules/') ? { kind: 'unknown' } : { kind: 'local' };
}

export function installCommand(pm: Pm, version: string) {
  const target = `${PACKAGE}@${version}`;
  const args = pm === 'npm' ? ['install', '-g', target] : pm === 'yarn' ? ['global', 'add', target] : ['add', '-g', target];
  return { cmd: pm, args };
}

const commandLine = ({ cmd, args }: { cmd: string; args: string[] }) => [cmd, ...args].join(' ');

async function fetchLatest(registry: string) {
  const base = registry.endsWith('/') ? registry : `${registry}/`;
  try {
    const res = await fetch(new URL(`${PACKAGE}/latest`, base), { signal: AbortSignal.timeout(10000) });
    const { version } = (await res.json()) as { version?: string };
    if (res.ok && typeof version === 'string' && /^\d+\.\d+\.\d+/.test(version)) return version;
    throw new Error(`registry returned ${res.status}`);
  } catch (err) {
    throw new CliError(`Could not get the latest ${PACKAGE} version from ${base}: ${(err as Error).message}`);
  }
}

function advice(install: Install, latest: string) {
  if (install.kind === 'transient') return `You ran ${PACKAGE} through ${install.runner}, which keeps no install to update. Run \`${install.runner} ${PACKAGE}@latest\` to get ${latest}.`;
  if (install.kind === 'local') return 'This is a local build from a Ryugi checkout. Update it with `git pull`, then `pnpm build` in artifacts/.';
  if (install.kind === 'launcher') return `The Ryugi skill runs ${PACKAGE} through its launcher, which moves to ${latest} within a day of its release.`;
  return null;
}

export interface UpdateOptions {
  current: string;
  file: string;
  env: NodeJS.ProcessEnv;
  registry: string;
  check: boolean;
  pm?: string;
}

export async function update(options: UpdateOptions, emit: Emit): Promise<number> {
  if (options.pm !== undefined && !PMS.includes(options.pm as Pm)) throw new CliError(`--pm must be one of ${PMS.join(', ')}`);
  const install: Install = options.pm ? { kind: 'global', pm: options.pm as Pm } : detectInstall(options.file, options.env);
  const latest = await fetchLatest(options.registry);
  writeLatest(latestFile(options.env), latest, Date.now());
  const report = { type: 'update-check', current: options.current, latest, install: install.kind };
  if (!newer(latest, options.current)) {
    emit({ ...report, upToDate: true, command: null });
    return 0;
  }
  if (install.kind === 'unknown') {
    const commands = PMS.map((pm) => `  ${commandLine(installCommand(pm, latest))}`).join('\n');
    throw new CliError(`Could not tell how ${PACKAGE} was installed (${options.file}). Install ${latest} with one of:\n${commands}\nor run \`${PACKAGE} update --pm <${PMS.join('|')}>\`.`);
  }
  if (install.kind !== 'global') {
    emit({ ...report, upToDate: false, command: null, message: advice(install, latest) });
    return 0;
  }
  const command = installCommand(install.pm, latest);
  if (options.check) {
    emit({ ...report, upToDate: false, command: commandLine(command) });
    return 0;
  }
  const windows = process.platform === 'win32';
  const result = windows
    ? spawnSync(commandLine(command), { stdio: ['inherit', 2, 2], env: options.env, shell: true })
    : spawnSync(command.cmd, command.args, { stdio: ['inherit', 2, 2], env: options.env });
  if (result.error) throw new CliError(`Could not run ${commandLine(command)}: ${result.error.message}`);
  if (result.status !== 0) throw new CliError(`${commandLine(command)} exited with ${result.status ?? result.signal}`);
  emit({ type: 'updated', from: options.current, to: latest, pm: install.pm, command: commandLine(command) });
  return 0;
}

export const updateCommand: CommandSpec = {
  name: 'update',
  summary: 'Install the newest ryugi-artifacts release with the package manager that installed this one',
  options: {
    check: { type: 'boolean', help: 'Compare versions only; do not install' },
    pm: { type: 'string', value: '<npm|pnpm|yarn|bun>', help: 'Use this package manager instead of detecting it' },
  },
  run: ({ values }, emit) => update({
    current: CLI_VERSION,
    file: __filename,
    env: process.env,
    registry: process.env.npm_config_registry || 'https://registry.npmjs.org/',
    check: !!values.check,
    pm: values.pm as string | undefined,
  }, emit),
  text: (value) => {
    if (value.type === 'updated') return `Updated ${PACKAGE} ${value.from} → ${value.to} with ${value.pm}. Running servers keep the old version until you run \`${PACKAGE} stop\`.`;
    if (value.type !== 'update-check') return null;
    if (value.upToDate) return `${PACKAGE} ${value.current} is the latest release.`;
    return value.message as string | undefined ?? `${PACKAGE} ${value.latest} is available (you have ${value.current}). Run: ${value.command}`;
  },
};
