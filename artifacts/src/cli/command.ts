import { parseArgs } from 'node:util';
import { CliError } from './paths';
import type { Emit } from './start';

export interface OptionSpec {
  type: 'string' | 'boolean';
  short?: string;
  value?: string;
  help?: string;
}

export type Options = Record<string, OptionSpec>;

export interface CommandInput {
  values: Record<string, string | boolean | undefined>;
  positionals: string[];
  projectDir: string;
}

export interface CommandSpec {
  name: string;
  summary: string;
  usage?: string[];
  details?: string;
  options: Options;
  positionals?: number;
  explicitJson?: boolean;
  run: (input: CommandInput, emit: Emit) => Promise<number> | number;
  text?: (value: Record<string, unknown>) => string | null;
}

const BIN = 'ryugi-artifacts';

export const COMMON: Options = {
  'project-dir': {
    type: 'string',
    value: '<path>',
    help: 'Project directory (default: current directory)',
  },
  'json': { type: 'boolean', help: 'Print one JSON line (default when not in a terminal)' },
};

const HELP_OPTION: Options = { help: { type: 'boolean', short: 'h', help: 'Show this help' } };

export function parse(args: string[], options: Options, positionals = 0) {
  const config = Object.fromEntries(
    Object.entries({ ...COMMON, ...options }).map(([name, { type, short }]) => [
      name,
      short ? { type, short } : { type },
    ]),
  );
  try {
    const parsed = parseArgs({
      args,
      options: config,
      allowPositionals: positionals > 0,
      strict: true,
    });
    if (parsed.positionals.length > positionals)
      throw new CliError(`Unknown argument: ${parsed.positionals[positionals]}`);
    return {
      values: parsed.values as CommandInput['values'],
      positionals: parsed.positionals,
      projectDir: (parsed.values['project-dir'] as string | undefined) ?? process.cwd(),
    };
  } catch (err) {
    if (err instanceof CliError) throw err;
    const flag = /'([^']+)'/.exec((err as Error).message)?.[1];
    throw new CliError(flag ? `Unknown argument: ${flag.split(' ')[0]}` : (err as Error).message);
  }
}

export function wantsHelp(args: string[]) {
  const end = args.indexOf('--');
  return (end === -1 ? args : args.slice(0, end)).some((arg) => arg === '--help' || arg === '-h');
}

function table(rows: [string, string][]) {
  const width = Math.max(...rows.map(([left]) => left.length)) + 2;
  return rows
    .map(([left, right]) =>
      `  ${left.padEnd(width)}${right.replace(/\n/g, `\n  ${' '.repeat(width)}`)}`.trimEnd(),
    )
    .join('\n');
}

export function optionRows(options: Options): [string, string][] {
  return Object.entries(options)
    .filter(([, option]) => option.help !== undefined)
    .map(([name, option]) => [
      `${option.short ? `-${option.short}, ` : ''}--${name}${option.value ? ` ${option.value}` : ''}`,
      option.help!,
    ]);
}

export function commandHelp(command: CommandSpec) {
  const usage = (command.usage ?? ['[options]']).map(
    (line, index) => `${index ? '       ' : 'Usage: '}${BIN} ${command.name} ${line}`,
  );
  return [
    usage.join('\n'),
    '',
    command.summary,
    ...(command.details ? ['', command.details] : []),
    '',
    'Options:',
    table(optionRows({ ...command.options, ...COMMON, ...HELP_OPTION })),
  ].join('\n');
}

export function rootHelp(commands: CommandSpec[], browseOptions: Options = {}) {
  return [
    `Usage: ${BIN} [project-directory] [--no-open]`,
    `       ${BIN} <command> [options]`,
    '',
    "Without a command, opens the project's artifacts in your browser and keeps the server",
    'running until Ctrl+C.',
    '',
    'Commands:',
    table(commands.map((command) => [command.name, command.summary])),
    '',
    `Run \`${BIN} <command> --help\` for a command's options.`,
    '',
    'Options:',
    table(
      optionRows({
        ...COMMON,
        ...browseOptions,
        version: { type: 'boolean', short: 'v', help: 'Print the version' },
        ...HELP_OPTION,
      }),
    ),
  ].join('\n');
}
