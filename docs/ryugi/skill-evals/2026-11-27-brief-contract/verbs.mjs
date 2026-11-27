import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = process.env.BRIEF_EVAL_RUNS || '/tmp/brief-eval';
const [host, variant] = process.argv.slice(2);
const dir = path.join(HERE, 'results', host);
const out = {};
let runs = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(variant + '-') && x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  runs++;
  const run = path.join(RUNS, [j.variant, j.host, j.task, j.rep].join('-'));
  for (const line of fs.readFileSync(path.join(run, 'calls.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const c = JSON.parse(line);
    if (c.args[0] === 'start' || c.args[0] === 'stop') continue;
    const k = (c.args[0] === 'comment' ? c.args.slice(0, 2).join(' ') : c.args[0]) + (c.args.includes('--detail') ? ' --detail' : '') + (c.args.includes('--source') ? ' --source' : '');
    out[k] ??= { n: 0, chars: 0 };
    out[k].n++;
    out[k].chars += c.out.length;
  }
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).sort((a, b) => b[1].chars - a[1].chars).map(([k, v]) => [k, 'n=' + v.n + ' avg=' + Math.round(v.chars / v.n) + ' perRun=' + Math.round(v.chars / runs)]))));
