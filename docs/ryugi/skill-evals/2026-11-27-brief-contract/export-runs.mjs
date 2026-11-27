import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNS = process.env.BRIEF_EVAL_RUNS || '/tmp/brief-eval';
const [target] = process.argv.slice(2);
const rows = [];
for (const host of ['claude', 'codex']) {
  const dir = path.join(HERE, 'results', host);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const calls = fs.readFileSync(path.join(RUNS, [j.variant, j.host, j.task, j.rep].join('-'), 'calls.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const m = j.metrics;
    rows.push({
      host: j.host,
      variant: j.variant,
      task: j.task,
      rep: Number(j.rep),
      completed: j.completed,
      tasksDone: j.tasksDone,
      consumed: j.consumed,
      humanOverwritten: j.humanOverwritten,
      totalTokens: m.totalTokens,
      inputTokens: m.inputTokens,
      cachedTokens: m.cachedTokens,
      outputTokens: m.outputTokens,
      roundTrips: m.roundTrips,
      toolCalls: m.toolCalls,
      cliCalls: m.cliCalls,
      cliChars: m.cliChars,
      actionChars: m.actionChars,
      acks: m.acks,
      failedCalls: m.failedCalls,
      helpCalls: calls.filter((c) => c.args.includes('--help') && c.args[0] !== 'start').length,
      elapsedMs: j.elapsed,
    });
  }
}
fs.writeFileSync(target, JSON.stringify(rows, null, 1) + '\n');
console.log(rows.length);
