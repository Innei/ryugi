import { execFile } from 'node:child_process';
import { commandHelp, parse, rootHelp, wantsHelp, type Options } from './command';
import { COMMANDS } from './commands';
import { CliError } from './paths';
import { start, type Emit } from './start';
import { notifyUpdate } from './update-hint';

declare const CLI_VERSION: string;

const BROWSE_OPTIONS: Options = { 'no-open': { type: 'boolean', help: 'Print the URL without opening a browser' } };

function text(value: Record<string, unknown>) {
  if (typeof value.error === 'string') return `Error: ${value.error}`;
  for (const command of COMMANDS) {
    const line = command.text?.(value);
    if (line != null) return line;
  }
  if (typeof value.status === 'string') return value.status === 'stopped' ? 'Stopped.' : value.status.replace(/_/g, ' ');
  return JSON.stringify(value);
}

function openBrowser(url: string) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  execFile(command, args, () => {});
}

async function browse(argv: string[]) {
  const { values, positionals } = parse(argv, BROWSE_OPTIONS, 1);
  if (positionals.length && values['project-dir']) throw new CliError('Specify one project directory.');
  return start({
    projectDir: (values['project-dir'] as string | undefined) ?? positionals[0] ?? process.cwd(),
    host: '127.0.0.1',
    open: false,
    foreground: true,
    background: false,
  }, (value) => {
    if (typeof value.error === 'string') { console.error(value.error); return; }
    if (value.type !== 'server-started') return;
    console.log(value.url);
    if (!value.reused) console.log('Press Ctrl+C to stop the server.');
    if (!values['no-open']) openBrowser(value.url as string);
  });
}

async function main(argv: string[]) {
  const [name, ...rest] = argv;
  const command = COMMANDS.find((candidate) => candidate.name === name);
  const json = argv.includes('--json') || (!command?.explicitJson && !process.stdout.isTTY);
  notifyUpdate(CLI_VERSION, json, argv);
  const emit: Emit = (value) => {
    const line = json ? JSON.stringify(value) : text(value);
    if (!json && typeof value.error === 'string') console.error(line);
    else console.log(line);
  };
  try {
    if (command) {
      if (wantsHelp(rest)) {
        console.log(commandHelp(command));
        return 0;
      }
      return await command.run(parse(rest, command.options, command.positionals), emit);
    }
    if (name === '--version' || name === '-v') {
      console.log(CLI_VERSION);
      return 0;
    }
    if (name === '--help' || name === '-h') {
      console.log(rootHelp(COMMANDS, BROWSE_OPTIONS));
      return 0;
    }
    return await browse(argv);
  } catch (err) {
    if (!(err instanceof CliError)) throw err;
    emit(err.message ? { error: err.message, ...err.fields } : err.fields);
    return err.code;
  }
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (err) => {
    console.log(JSON.stringify({ error: (err as Error).message }));
    process.exitCode = 1;
  },
);
