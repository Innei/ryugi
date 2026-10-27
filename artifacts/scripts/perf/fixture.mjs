import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [source, target, repeat = '5', columns = '7'] = process.argv.slice(2);
if (!source || !target)
  throw new Error(
    'usage: fixture.mjs <source artboard dir> <target artboard dir> [repeat] [columns]',
  );
const canvas = JSON.parse(readFileSync(path.join(source, 'canvas.json'), 'utf8'));
const page = canvas.activePage ?? canvas.pages[0].id;
const originals = Object.entries(canvas.boards).filter(([, board]) => board.page === page);
const cell = {
  w: Math.max(...originals.map(([, b]) => b.w)) + 120,
  h: Math.max(...originals.map(([, b]) => b.h)) + 200,
};
const boards = {};
for (let copy = 0; copy < Number(repeat); copy++)
  originals.forEach(([id, board], i) => {
    const n = copy * originals.length + i;
    boards[`${id}-${copy}`] = {
      ...board,
      x: (n % Number(columns)) * cell.w,
      y: Math.floor(n / Number(columns)) * cell.h,
      title: `${board.title ?? id} · ${copy + 1}`,
    };
  });
mkdirSync(target, { recursive: true });
cpSync(path.join(source, 'pages'), path.join(target, 'pages'), { recursive: true });
writeFileSync(
  path.join(target, 'canvas.json'),
  JSON.stringify(
    {
      ...canvas,
      title: `${canvas.title} ×${repeat}`,
      activePage: page,
      pages: canvas.pages.filter((p) => p.id === page),
      boards,
      groups: {},
      notes: {},
    },
    null,
    2,
  ),
);
console.log(`${Object.keys(boards).length} boards in ${target}`);
