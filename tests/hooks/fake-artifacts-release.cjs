'use strict';

const fs = require('node:fs');
const path = require('node:path');

const VERSION = '9.9.9';

const CLI = `'use strict';
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];
if (args.includes('--version')) {
  console.log(JSON.stringify({
    schema: 'ryugi.cli/v1',
    command: 'version',
    outcome: 'success',
    data: { capabilities: ['reviewBundlesV1'] },
  }));
} else {
  if (process.env.RYUGI_FAKE_CLI_LOG)
    require('node:fs').appendFileSync(process.env.RYUGI_FAKE_CLI_LOG, JSON.stringify({ args, host: process.env.RYUGI_WRITER_HOST ?? null, agent: process.env.RYUGI_WRITER_AGENT ?? null, thread: process.env.CODEX_THREAD_ID ?? null }) + '\\n');
  console.log(\`Comment list: \${flag('--artifact')} · fake \${flag('--section')}\`);
}
`;

// The launcher resolves the CLI from the XDG cache; seeding a release there keeps tests offline.
function seedFakeRelease(cacheHome) {
  const releases = path.join(cacheHome, 'ryugi', 'artifacts');
  const dist = path.join(releases, VERSION, 'node_modules', 'ryugi-artifacts', 'dist');
  fs.mkdirSync(dist, { recursive: true });
  fs.writeFileSync(path.join(dist, 'cli.cjs'), CLI);
  fs.writeFileSync(
    path.join(releases, 'latest.json'),
    JSON.stringify({ version: VERSION, checkedAt: Date.now() }),
  );
}

module.exports = { seedFakeRelease };
