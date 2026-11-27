import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'results', 'codex');
fs.mkdirSync(OUT, { recursive: true });
const [reps, concurrency, ...tasks] = process.argv.slice(2);
const jobs = [];
for (let rep = 1; rep <= Number(reps); rep++) for (const task of tasks) for (const variant of (process.env.BRIEF_EVAL_VARIANTS || 'before,after').split(',')) jobs.push({ variant, task, rep });
const node = process.execPath;
const sh = (args, opts = {}) => new Promise((resolve) => {
  const child = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  let out = '', err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  child.on('close', (code) => resolve({ code, out, err }));
});
async function one(job) {
  const name = [job.variant, 'codex', job.task, job.rep].join('-');
  const target = path.join(OUT, name + '.json');
  if (fs.existsSync(target)) return;
  const prep = await sh([node, path.join(HERE, 'harness.mjs'), 'prepare', job.variant, job.task, String(job.rep), 'codex']);
  const run = prep.out.trim().split('\n').pop();
  if (prep.code !== 0 || !run) return fs.writeFileSync(target + '.failed', prep.err + prep.out);
  const started = Date.now();
  await sh(['bash', path.join(HERE, 'run-codex.sh'), run]);
  const elapsed = Date.now() - started;
  const graded = await sh([node, path.join(HERE, 'harness.mjs'), 'grade', run]);
  const metrics = await sh([node, path.join(HERE, 'metrics.mjs'), 'codex', run]);
  try {
    fs.writeFileSync(target, JSON.stringify({ ...JSON.parse(graded.out), metrics: JSON.parse(metrics.out), elapsed }, null, 2));
  } catch (e) {
    fs.writeFileSync(target + '.failed', String(e) + graded.err + metrics.err);
  }
}
let next = 0;
await Promise.all(Array.from({ length: Number(concurrency) }, async () => { while (next < jobs.length) await one(jobs[next++]); }));
console.log('done ' + jobs.length);
