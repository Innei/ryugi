import { execFile } from 'node:child_process';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { check, checkText } from './check';
import { comment, commentText } from './comment';
import { config } from './config';
import { CliError } from './paths';
import { start, type Emit } from './start';
import { publish, type PublishAction } from './publish';
import { stop } from './stop';

declare const CLI_VERSION: string;

const HELP = `Usage: ryugi-artifacts [project-directory] [--no-open]
       ryugi-artifacts <command> [options]

Without a command, opens the project's artifacts in your browser and keeps the server
running until Ctrl+C.

Commands:
  start     Start the project's artifacts server, or reuse the running one
  stop      Stop the project's artifacts server; the artifacts are kept
  check     Wait until the server has checked the latest write, then print its warnings (needs a running server):
              --artifact <type>/<id>
  publish   Publish an artifact to the Ryugi cloud (needs a running server):
              --artifact <type>/<id> [--public | --private] [--unpublish]
              --list | --delete <cloud-id> | --login | --logout
  comment   Read and answer comments on a document or artboard (needs a running server):
              list    --artifact <document|artboard>/<id> [--all]   what changed since you last listed
              add     --artifact document/<id> --block <blockId> [--quote <text>] [--text <text>]
              add     --artifact artboard/<id> --board <boardId> [--x <px> --y <px>] [--text <text>]
              reply   --artifact <document|artboard>/<id> --thread <threadId> [--text <text>]
              resolve --artifact <document|artboard>/<id> --thread <threadId>
            Without --text, add and reply read the message from stdin.
  config    Auto-publish changed artifacts as private cloud copies when the agent's turn ends:
              --auto-publish on|off              for every project
              --auto-publish on|off|inherit --project   override for this project only
            Without --auto-publish, prints the current values.

Options:
  --project-dir <path>  Project directory (default: current directory)
  --json                Print one JSON line (default when not in a terminal)
  -v, --version         Print the version
  --no-open             Print the URL without opening a browser
  -h, --help            Show this help`;

type Options = NonNullable<ParseArgsConfig['options']>;
const common: Options = { 'project-dir': { type: 'string' }, json: { type: 'boolean' } };

function parse(args: string[], options: Options, positionals = 0) {
  try {
    const parsed = parseArgs({ args, options: { ...common, ...options }, allowPositionals: positionals > 0, strict: true });
    if (parsed.positionals.length > positionals) throw new CliError(`Unknown argument: ${parsed.positionals[positionals]}`);
    return parsed;
  } catch (err) {
    if (err instanceof CliError) throw err;
    const flag = /'([^']+)'/.exec((err as Error).message)?.[1];
    throw new CliError(flag ? `Unknown argument: ${flag.split(' ')[0]}` : (err as Error).message);
  }
}

function text(value: Record<string, unknown>) {
  if (typeof value.error === 'string') return `Error: ${value.error}`;
  if (value.type === 'server-started') return `${value.link ?? value.url}${value.reused ? ' (already running)' : ''}`;
  if (value.type === 'login-required' || value.type === 'login') return `${value.message}\n${value.url}`;
  if (value.type === 'published') return `${value.url} (${value.visibility})`;
  if (value.type === 'auto-publish') return `Auto-publish: ${value.global === null ? 'not decided' : value.global ? 'on' : 'off'} for every project${value.project === null ? '' : `, ${value.project ? 'on' : 'off'} for this project`}.`;
  const checked = checkText(value);
  if (checked !== null) return checked;
  const commented = commentText(value);
  if (commented !== null) return commented;
  if (typeof value.status === 'string') return value.status === 'stopped' ? 'Stopped.' : value.status.replace(/_/g, ' ');
  return JSON.stringify(value);
}

function openBrowser(url: string) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', url] : [url];
  execFile(command, args, () => {});
}

async function browse(argv: string[]) {
  const { values, positionals } = parse(argv, { 'no-open': { type: 'boolean' } }, 1);
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
  const [command, ...rest] = argv;
  const json = argv.includes('--json') || !process.stdout.isTTY;
  const emit: Emit = (value) => {
    const line = json ? JSON.stringify(value) : text(value);
    if (!json && typeof value.error === 'string') console.error(line);
    else console.log(line);
  };
  try {
    if (command === 'start') {
      const { values } = parse(rest, {
        artifact: { type: 'string' }, host: { type: 'string' }, 'url-host': { type: 'string' }, 'idle-timeout-minutes': { type: 'string' },
        open: { type: 'boolean' }, 'no-open': { type: 'boolean' }, foreground: { type: 'boolean' }, 'no-daemon': { type: 'boolean' },
        background: { type: 'boolean' }, daemon: { type: 'boolean' },
      });
      return await start({
        projectDir: (values['project-dir'] as string | undefined) ?? process.cwd(),
        artifact: values.artifact as string | undefined,
        host: (values.host as string | undefined) ?? '127.0.0.1',
        urlHost: values['url-host'] as string | undefined,
        idleTimeoutMinutes: values['idle-timeout-minutes'] as string | undefined,
        open: values['no-open'] ? false : values.open ? true : process.env.ARTIFACTS_OPEN !== '0',
        foreground: !!(values.foreground || values['no-daemon']),
        background: !!(values.background || values.daemon),
      }, emit);
    }
    if (command === 'stop') {
      const { values, positionals } = parse(rest, {}, 1);
      return await stop((values['project-dir'] as string | undefined) ?? positionals[0] ?? process.cwd(), emit);
    }
    if (command === 'check') {
      const { values } = parse(rest, { artifact: { type: 'string' } });
      return await check({
        projectDir: (values['project-dir'] as string | undefined) ?? process.cwd(),
        artifact: values.artifact as string | undefined,
      }, emit);
    }
    if (command === 'publish') {
      const { values } = parse(rest, {
        artifact: { type: 'string' }, public: { type: 'boolean' }, private: { type: 'boolean' }, unpublish: { type: 'boolean' },
        list: { type: 'boolean' }, delete: { type: 'string' }, login: { type: 'boolean' }, logout: { type: 'boolean' },
      });
      const actions = (['unpublish', 'list', 'delete', 'login', 'logout'] as const).filter((name) => values[name] !== undefined && values[name] !== false);
      if (actions.length > 1) throw new CliError(`Choose one of --${actions.join(', --')}`);
      const action: PublishAction = actions[0] ?? 'publish';
      return await publish({
        projectDir: (values['project-dir'] as string | undefined) ?? process.cwd(),
        action,
        artifact: values.artifact as string | undefined,
        visibility: values.public ? 'public' : values.private ? 'private' : undefined,
        cloudId: values.delete as string | undefined,
      }, emit);
    }
    if (command === 'comment') {
      const { values, positionals } = parse(rest, {
        artifact: { type: 'string' }, all: { type: 'boolean' }, block: { type: 'string' }, quote: { type: 'string' },
        thread: { type: 'string' }, text: { type: 'string' }, board: { type: 'string' }, x: { type: 'string' }, y: { type: 'string' },
      }, 1);
      return await comment({
        projectDir: (values['project-dir'] as string | undefined) ?? process.cwd(),
        action: positionals[0],
        artifact: values.artifact as string | undefined,
        all: values.all as boolean | undefined,
        block: values.block as string | undefined,
        quote: values.quote as string | undefined,
        thread: values.thread as string | undefined,
        text: values.text as string | undefined,
        board: values.board as string | undefined,
        x: values.x as string | undefined,
        y: values.y as string | undefined,
      }, emit);
    }
    if (command === 'config') {
      const { values } = parse(rest, { 'auto-publish': { type: 'string' }, project: { type: 'boolean' } });
      return config({
        projectDir: (values['project-dir'] as string | undefined) ?? process.cwd(),
        autoPublish: values['auto-publish'] as string | undefined,
        project: !!values.project,
      }, emit);
    }
    if (command === '--version' || command === '-v') {
      console.log(CLI_VERSION);
      return 0;
    }
    if (command === '--help' || command === '-h') {
      console.log(HELP);
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
