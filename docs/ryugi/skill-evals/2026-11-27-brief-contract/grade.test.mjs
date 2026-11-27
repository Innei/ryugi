import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { TASKS } from './harness.mjs';

function seed(task) {
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-grade-'));
  const project = path.join(run, 'project');
  fs.mkdirSync(path.join(run, 'seed'), { recursive: true });
  for (const [doc, [xml, threads]] of Object.entries(TASKS[task].docs)) {
    const dir = path.join(project, '.artideck', 'artifacts', 'document', doc);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'doc.xml'), xml);
    fs.writeFileSync(path.join(dir, 'comments.json'), JSON.stringify({ version: 1, threads }));
    fs.writeFileSync(path.join(run, 'seed', doc + '.xml'), xml);
  }
  return project;
}
const doc = (p, d) => path.join(p, '.artideck', 'artifacts', 'document', d);
function reply(p, d, id, text) {
  const file = path.join(doc(p, d), 'comments.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  value.threads.find((t) => t.id === id).messages.push({ id: 'x' + id, author: 'agent', name: 'Agent', at: '2026-11-20T09:00:00.000Z', text });
  fs.writeFileSync(file, JSON.stringify(value));
}

test('a short reply passes only once the block says three and the thread has a reply', () => {
  const p = seed('short-reply');
  assert.equal(TASKS['short-reply'].check(p).every((c) => c.ok), false);
  const file = path.join(doc(p, 'retry-policy'), 'doc.xml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('five', 'three'));
  reply(p, 'retry-policy', 't1', 'Changed to three.');
  assert.deepEqual(TASKS['short-reply'].check(p).map((c) => c.ok), [true, true, true]);
});

test('a question passes with an explanation and the text left alone, and fails once the text changes', () => {
  const p = seed('question');
  reply(p, 'retries', 't1', 'The carrier API drops about one in a thousand requests.');
  assert.deepEqual(TASKS.question.check(p).map((c) => c.ok), [true, true]);
  const file = path.join(doc(p, 'retries'), 'doc.xml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('five', 'three'));
  assert.equal(TASKS.question.check(p)[0].ok, false);
});

test('the concurrent edit check fails when the human sentence is gone', () => {
  const p = seed('concurrent-edit');
  const checks = TASKS['concurrent-edit'].check(p);
  assert.equal(checks.find((c) => c.humanKept).ok, false);
});
