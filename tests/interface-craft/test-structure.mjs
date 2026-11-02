// Run: node tests/interface-craft/test-structure.mjs
// Static contracts, not a replacement for live agent behavior evaluation.
/* eslint-disable no-console */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (file) => readFileSync(path.resolve(root, file), 'utf8');
const skillPath = 'skills/interface-craft/SKILL.md';
const skill = read(skillPath);
const signs = read('skills/interface-craft/references/signs.md');
const tokens = read('skills/interface-craft/references/tokens.md');
const evaluation = read('skills/interface-craft/references/evaluation.md');
const brainstorming = read('skills/brainstorming/SKILL.md');
const rounds = read('skills/brainstorming/artboard-rounds.md');
const spec = read('skills/brainstorming/written-design.md');
const artifacts = read('skills/artifacts/SKILL.md');
const muse = JSON.parse(read('.muse-plugin/plugin.json'));
const rubric = read('tests/interface-craft/eval-rubric.md');
const passes = [
  'spacing',
  'color',
  'icons',
  'copy',
  'type',
  'layout',
  'details',
  'visuals',
  'motion',
];
const checks = [
  ['valid skill entry', /^---\nname: interface-craft$/m.test(skill)],
  [
    'descriptive when-to-use trigger',
    /^description: Use when .*visible product interface/m.test(skill),
  ],
  [
    'five design lenses',
    ['Product', 'Character', 'World', 'Moments', 'Signature'].every((name) =>
      skill.includes('**' + name + ':**'),
    ),
  ],
  [
    'three task modes',
    ['**Create**', '**Repair**', '**Edit**'].every((name) => skill.includes(name)),
  ],
  [
    'directs to an audit before judging',
    skill.includes('Audit before judging') && skill.includes('signs.md'),
  ],
  [
    'ordered passes, edits after an audit',
    passes.every((name) => skill.includes(name)) &&
      /spacing . color . icons . copy . type . layout . details . visuals . motion/.test(skill),
  ],
  [
    'falsifiable checklist',
    ['Name-swap test', 'tabular', 'claims that the user did not supply'].every((item) =>
      skill.includes(item),
    ),
  ],
  ['bounded render budget', /three renders/.test(skill)],
  ['no extra approval', skill.includes('no new approval gate')],
  [
    'all references exist',
    ['direction.md', 'signs.md', 'tokens.md', 'evaluation.md'].every((name) =>
      existsSync(path.resolve(root, 'skills/interface-craft/references', name)),
    ),
  ],
  [
    'retired heuristic file removed',
    !existsSync(path.resolve(root, 'skills/interface-craft/references/craft.md')),
  ],
  [
    'signs are enumerable with fixes',
    (signs.match(/→/g) || []).length >= 30 && signs.includes('Objective defects'),
  ],
  [
    'tokens carry real values',
    [
      '4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128',
      'inner = outer − padding',
      'tabular-nums',
    ].every((item) => tokens.includes(item)),
  ],
  [
    'review classifies findings',
    ['Objective defect', 'Design hypothesis', 'Preference'].every((item) =>
      evaluation.includes(item),
    ),
  ],
  [
    'review keeps nine ordered passes',
    passes.every((name) => evaluation.toLowerCase().includes('**' + name + '**')),
  ],
  ['brainstorming integration', brainstorming.includes('ryugi:interface-craft')],
  ['Artboard direction carried forward', rounds.includes('selected visual direction')],
  ['spec preserves design direction', spec.includes('selected visual direction')],
  ['direct Artifacts integration', artifacts.includes('ryugi:interface-craft')],
  [
    'Muse registration',
    muse.capabilities.skills.some(
      (item) => item.id === 'interface-craft' && item.path === skillPath,
    ),
  ],
  [
    'external agent CLI harness retired',
    !existsSync(path.resolve(root, 'tests/interface-craft/run-live-eval.sh')),
  ],
  [
    'rubric isolates evaluation',
    rubric.includes('must not drive an external') && rubric.includes('must not publish'),
  ],
  [
    'measurement tool present',
    existsSync(path.resolve(root, 'tests/interface-craft/measure-boards.mjs')),
  ],
];
let failed = 0;
for (const [name, passes_] of checks) {
  console.log((passes_ ? 'PASS' : 'FAIL') + ': ' + name);
  if (!passes_) failed++;
}
console.log(checks.length - failed + '/' + checks.length + ' checks passed');
process.exitCode = failed ? 1 : 0;
