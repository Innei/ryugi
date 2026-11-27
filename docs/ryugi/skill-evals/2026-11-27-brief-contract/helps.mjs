import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = process.env.BRIEF_EVAL_RUNS || '/tmp/brief-eval';
const result = {};
for (const host of ['claude', 'codex']) for (const variant of ['before', 'after']) {
  const dir = path.join(HERE, 'results', host);
  let runs = 0, helps = 0, chars = 0, withHelp = 0;
  const which = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(variant + '-') && x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    runs++;
    let any = false;
    for (const line of fs.readFileSync(path.join(RUNS, [j.variant, j.host, j.task, j.rep].join('-'), 'calls.jsonl'), 'utf8').split('\n').filter(Boolean)) {
      const c = JSON.parse(line);
      if (!c.args.includes('--help') && !c.args.includes('-h')) continue;
      helps++; any = true; chars += c.out.length;
      const k = c.args.filter((a) => !a.startsWith('-')).slice(0, 2).join(' ');
      which[k] = (which[k] ?? 0) + 1;
    }
    if (any) withHelp++;
  }
  result[host + '|' + variant] = { runs, helps, withHelp, charsPerRun: Math.round(chars / runs), which };
}
console.log(JSON.stringify(result));
