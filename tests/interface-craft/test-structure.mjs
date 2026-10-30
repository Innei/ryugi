// Run: node tests/interface-craft/test-structure.mjs
// Static contracts, not a replacement for live agent behavior evaluation.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const skillPath = 'skills/interface-craft/SKILL.md';
const skill = read(skillPath);
const brainstorming = read('skills/brainstorming/SKILL.md');
const rounds = read('skills/brainstorming/artboard-rounds.md');
const spec = read('skills/brainstorming/written-design.md');
const artifacts = read('skills/artifacts/SKILL.md');
const muse = JSON.parse(read('.muse-plugin/plugin.json'));
const checks = [
  ['valid skill entry', /^---\nname: interface-craft$/m.test(skill)],
  ['descriptive when-to-use trigger', /^description: Use when .*visible product interface/m.test(skill)],
  ['five design lenses', ['Product', 'Character', 'World', 'Moments', 'Signature'].every((name) => skill.includes('**' + name + ':'))],
  ['both creation and refinement', skill.includes('Create / explore') && skill.includes('Review / refine')],
  ['precise edit exception', skill.includes('Precise edit')],
  ['no extra approval', skill.includes('no new approval gate')],
  ['all references exist', ['direction.md', 'craft.md', 'evaluation.md'].every((name) => existsSync(resolve(root, 'skills/interface-craft/references', name)))],
  ['brainstorming integration', brainstorming.includes('ryugi:interface-craft')],
  ['Artboard direction carried forward', rounds.includes('selected visual direction')],
  ['spec preserves design direction', spec.includes('selected visual direction')],
  ['direct Artifacts integration', artifacts.includes('ryugi:interface-craft')],
  ['Muse registration', muse.capabilities.skills.some((item) => item.id === 'interface-craft' && item.path === skillPath)],
];
let failed = 0;
for (const [name, passes] of checks) {
  console.log((passes ? 'PASS' : 'FAIL') + ': ' + name);
  if (!passes) failed++;
}
console.log(checks.length - failed + '/' + checks.length + ' checks passed');
process.exitCode = failed ? 1 : 0;
