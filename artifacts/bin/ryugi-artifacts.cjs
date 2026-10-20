#!/usr/bin/env node
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { parseArgs } = require('node:util');

try {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      'no-open': { type: 'boolean' },
      'project-dir': { type: 'string' },
    },
    allowPositionals: true,
  });
  if (values.help) {
    console.log('Usage: ryugi-artifacts [project-directory] [--no-open]\n\nOpen the current project’s artifacts in your browser.\n\n  --project-dir <path>  Project directory (default: current directory)\n  --no-open             Print the URL without opening a browser\n  -h, --help            Show this help\n\nRequires Node.js and Bash (Git Bash on Windows).');
  } else {
    if (positionals.length > 1 || (positionals.length && values['project-dir'])) throw new Error('Specify one project directory.');
    const project = fs.realpathSync(path.resolve(values['project-dir'] || positionals[0] || process.cwd()));
    if (!fs.statSync(project).isDirectory()) throw new Error('Project path must be a directory.');
    const child = spawn('bash', [path.join(__dirname, '../dist/start-server.sh'), '--project-dir', project, '--foreground', '--no-open'], {
      stdio: ['inherit', 'pipe', 'inherit'],
    });
    let interrupted = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
      interrupted = true;
      child.kill('SIGTERM');
    });
    child.on('error', (error) => {
      console.error(`Could not start artifacts: ${error.message}. Bash is required (Git Bash on Windows).`);
      process.exitCode = 1;
    });
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      let info;
      try { info = JSON.parse(line); } catch { console.error(line); return; }
      if (info.error) console.error(info.error);
      if (info.type !== 'server-started') return;
      console.log(info.url);
      if (!info.reused) console.log('Press Ctrl+C to stop the server.');
      if (values['no-open']) return;
      const platform = process.platform;
      const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
      const args = platform === 'win32' ? ['/c', 'start', '""', info.url] : [info.url];
      execFile(command, args, () => {});
    });
    child.on('close', (code) => { process.exitCode = interrupted ? 0 : code ?? 1; });
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
