// Objective checks for rendered boards. No network, no artifacts server, no cloud.
// usage: node tests/interface-craft/measure-boards.mjs <dir>
/* eslint-disable no-console */
//
// Reads every .html under <dir>, renders it in headless Chrome at 1440×900 and
// prints one JSON line per file. The numbers are the rubric's evidence:
//   occludedPoints  text sampled points where the topmost element is not the text
//                   (covered headlines, floating cards over copy)
//   clippedText     leaf text whose scrollWidth exceeds clientWidth
//   offGridShare    share of padding/margin/gap/radius values off the 4px grid
//   tabular         share of digit-bearing leaves using tabular figures
//   dollarAmounts / trustClaims  invented prices and social-proof copy
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const chrome = CHROME_CANDIDATES.find((candidate) => {
  try {
    statSync(candidate);
    return true;
  } catch {
    return false;
  }
});

if (!chrome) {
  console.error('measure-boards: no Chrome found; set CHROME_PATH');
  process.exit(2);
}

const target = process.argv[2];
if (!target) {
  console.error('usage: node tests/interface-craft/measure-boards.mjs <dir>');
  process.exit(2);
}

const probe = `<script>
(() => {
  const rect = (e) => e.getBoundingClientRect();
  const isOwn = (node, el) => node === el || el.contains(node) || node.contains(el);
  const texts = [...document.querySelectorAll('h1,h2,h3,p,li,span,td')].filter(
    (e) => e.children.length === 0 && e.textContent.trim()
  );
  let occludedPoints = 0;
  const occludedTexts = [];
  for (const t of texts) {
    const r = rect(t);
    if (r.width < 4 || r.height < 4) continue;
    let bad = 0, sampled = 0;
    for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.25, 0.5, 0.75]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      sampled++;
      if (!isOwn(hit, t)) bad++;
    }
    if (sampled && bad >= Math.ceil(sampled / 3)) {
      occludedPoints += bad;
      occludedTexts.push(t.textContent.trim().slice(0, 32));
    }
  }
  const visuallyHidden = (e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return (
      /sr-only|visually-hidden|screen-reader/.test(e.className || '') ||
      cs.clipPath !== 'none' ||
      (r.width <= 2 && r.height <= 2)
    );
  };
  const clippedElements = [...document.querySelectorAll('body *')].filter(
    (e) =>
      e.children.length === 0 &&
      e.textContent.trim() &&
      !visuallyHidden(e) &&
      e.scrollWidth > e.clientWidth + 2
  );
  const clippedText = clippedElements.length;
  const clippedTexts = clippedElements.slice(0, 3).map((e) => (e.className || e.tagName) + ': ' + e.textContent.trim().slice(0, 40));
  const px = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    for (const prop of ['paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','rowGap','columnGap','borderTopLeftRadius']) {
      const v = cs[prop];
      if (v && v.endsWith('px')) px.push(parseFloat(v));
    }
  }
  const offGrid = px.filter((v) => v > 0 && v !== 2 && v % 4 !== 0).length;
  const figures = [...document.querySelectorAll('body *')].filter(
    (e) => e.children.length === 0 && /\\d/.test(e.textContent) && e.textContent.trim().length > 1
  );
  const tabularFigures = figures.filter((e) => getComputedStyle(e).fontVariantNumeric.includes('tabular')).length;
  const text = document.body.innerText;
  const result = {
    occludedPoints,
    occludedTexts: occludedTexts.slice(0, 3),
    clippedText,
    clippedTexts,
    spacingValues: px.length,
    offGridShare: px.length ? +(offGrid / px.length).toFixed(3) : 0,
    tabular: figures.length ? +(tabularFigures / figures.length).toFixed(2) : 0,
    dollarAmounts: (text.match(/\\$\\s?\\d[\\d,.]*/g) || []).length,
    trustClaims: (text.match(/trusted by|used by|loved by|teams? use/gi) || []).length,
    height: document.documentElement.scrollHeight,
  };
  const pre = document.createElement('pre');
  pre.id = 'PROBE';
  pre.textContent = JSON.stringify(result);
  document.body.appendChild(pre);
})();
</script>`;

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('.html')) files.push(full);
  }
};
walk(target);

const scratch = mkdtempSync(path.join(tmpdir(), 'board-measure-'));
for (const file of files.sort()) {
  const copy = path.join(scratch, `${path.basename(path.dirname(file))}-${path.basename(file)}`);
  writeFileSync(copy, readFileSync(file, 'utf8') + probe);
  let dom;
  try {
    dom = execFileSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--user-data-dir=' + path.join(scratch, 'profile'),
        '--window-size=1440,900',
        '--dump-dom',
        'file://' + copy,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
  } catch (error) {
    dom = error.stdout || '';
  }
  const match = dom.match(/<pre id="PROBE">([\s\S]*?)<\/pre>/);
  const result = match
    ? JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
    : { error: 'probe did not run' };
  console.log(JSON.stringify({ file: file.slice(target.length + 1), ...result }));
}
