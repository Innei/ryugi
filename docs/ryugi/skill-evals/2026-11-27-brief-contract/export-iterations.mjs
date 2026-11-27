import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const [target] = process.argv.slice(2);
const stages = [
  ['1 · cursor and read-state wording fixed, byte-exact --base', 'stale-base-compare'],
  ['2 · --base ignores trailing whitespace, no reply syntax in skill', 'stale-no-reply-syntax'],
  ['3 · reply and resolve syntax in skill (final)', null],
];
const rows = [];
for (const [stage, dir] of stages) {
  for (const host of ['claude', 'codex']) {
    const base = dir ? path.join(HERE, 'results', dir, host) : path.join(HERE, 'results', host);
    if (!fs.existsSync(base)) continue;
    for (const f of fs.readdirSync(base).filter((x) => x.startsWith('after-') && x.endsWith('.json'))) {
      const j = JSON.parse(fs.readFileSync(path.join(base, f), 'utf8'));
      rows.push({ stage, host: j.host, task: j.task, completed: j.completed, totalTokens: j.metrics.totalTokens, roundTrips: j.metrics.roundTrips, cliChars: j.metrics.cliChars, failedCalls: j.metrics.failedCalls });
    }
  }
}
fs.writeFileSync(target, JSON.stringify(rows, null, 1) + '\n');
console.log(rows.length);
