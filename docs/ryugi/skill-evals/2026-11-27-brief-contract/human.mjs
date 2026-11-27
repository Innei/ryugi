import fs from 'node:fs';
import path from 'node:path';

const [run, raw] = process.argv.slice(2);
const spec = JSON.parse(raw);
const meta = JSON.parse(fs.readFileSync(path.join(run, 'meta.json'), 'utf8'));
const file = path.join(meta.project, '.artideck', 'artifacts', 'document', spec.artifact, 'doc.xml');
const deadline = Date.now() + 20 * 60 * 1000;
const seen = () => {
  const calls = fs.existsSync(path.join(run, 'calls.jsonl')) ? fs.readFileSync(path.join(run, 'calls.jsonl'), 'utf8') : '';
  return calls.split('\n').filter(Boolean).some((l) => JSON.parse(l).args[0] === spec.after);
};
while (Date.now() < deadline && !seen()) await new Promise((r) => setTimeout(r, 300));
await new Promise((r) => setTimeout(r, spec.delay));
const xml = fs.readFileSync(file, 'utf8');
const next = xml.replace(new RegExp('(<(\\w+) id="' + spec.block + '"[^>]*>)[\\s\\S]*?(</\\2>)'), (_, open, _tag, close) => open + spec.text + close);
fs.writeFileSync(file, next);
fs.writeFileSync(path.join(run, 'human-edit.json'), JSON.stringify({ at: Date.now() }));
