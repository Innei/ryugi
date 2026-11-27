import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const rows = [];
for (const host of ['claude', 'codex']) {
  const dir = path.join(HERE, 'results', host);
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) rows.push(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const NUM = ['totalTokens', 'inputTokens', 'outputTokens', 'cachedTokens', 'roundTrips', 'toolCalls', 'cliCalls', 'cliChars', 'actionChars', 'acks', 'repeatedReads', 'docReads', 'failedCalls'];
function summarize(group) {
  const out = { runs: group.length, completed: group.filter((r) => r.completed).length, tasksDone: group.filter((r) => r.tasksDone).length, consumed: group.filter((r) => r.consumed).length };
  for (const k of NUM) out[k] = mean(group.map((r) => r.metrics[k]).filter((v) => typeof v === 'number'));
  const chars = group.reduce((a, r) => a + r.metrics.cliChars, 0);
  const action = group.reduce((a, r) => a + r.metrics.actionChars, 0);
  out.utilization = chars ? 1 - action / chars : null;
  const human = group.filter((r) => r.humanOverwritten !== null);
  out.humanRuns = human.length;
  out.humanOverwritten = human.filter((r) => r.humanOverwritten).length;
  out.elapsed = mean(group.map((r) => r.elapsed));
  return out;
}
const key = (...parts) => parts.join('|');
const groups = new Map();
for (const r of rows) {
  for (const k of [key(r.host, r.variant), key(r.host, r.variant, r.task)]) {
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
}
const summary = {};
for (const [k, g] of groups) summary[k] = summarize(g);
const delta = (host, task) => {
  const b = summary[key(host, 'before', ...(task ? [task] : []))];
  const a = summary[key(host, 'after', ...(task ? [task] : []))];
  if (!a || !b) return null;
  const rate = (k) => (b[k] ? 1 - a[k] / b[k] : null);
  return { tokenReduction: rate('totalTokens'), inputReduction: rate('inputTokens'), outputReduction: rate('outputTokens'), roundTripReduction: rate('roundTrips'), cliCharReduction: rate('cliChars'), cliCallReduction: rate('cliCalls') };
};
const tasks = [...new Set(rows.map((r) => r.task))].sort();
const report = { rows: rows.length, summary, deltas: Object.fromEntries(['claude', 'codex'].flatMap((h) => [[h, delta(h)], ...tasks.map((t) => [h + '|' + t, delta(h, t)])])) };
fs.writeFileSync(path.join(HERE, 'results', 'summary.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ rows: rows.length, overall: Object.fromEntries(Object.entries(summary).filter(([k]) => k.split('|').length === 2)), deltas: { claude: report.deltas.claude, codex: report.deltas.codex } }, null, 2));
