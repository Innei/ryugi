import type { ArtifactType } from './types';

export interface ThumbnailArtifact {
  id: string;
  type: ArtifactType;
  title?: string | null;
  project?: string | null;
}

// Bump the path when the drawing changes so immutable browser copies are replaced.
export const THUMBNAIL_PATH = '_ryugi/thumbnail-v1.svg';

const STYLE =
  '<style>:root{--ink:#333;--muted:#85817c;--paper:#fff;--bg:#f3f2f0;--border:#dedcd7;--block:#f2f1ee;--alert:#f7eee4}@media (prefers-color-scheme: dark){:root{--ink:#e5e5e5;--muted:#a0a0a0;--paper:#292929;--bg:#1c1c1c;--border:#424242;--block:#353535;--alert:#3b342e}}text{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,sans-serif}rect{stroke-width:.8;vector-effect:non-scaling-stroke}</style>';

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const string = (value: unknown) => (typeof value === 'string' ? value : '');
const children = (value: unknown): ObjectValue[] =>
  Array.isArray(value) ? value.slice(0, 200).map(object) : [];
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9;
const rect = (x: number, y: number, w: number, h: number, fill = 'var(--paper)', stroke = 'none') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}"/>`;
const text = (x: number, y: number, value: string, size = 9, color = 'var(--ink)', weight = 400) =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${escape(value)}</text>`;

function wrap(value: string, size: number, width: number, limit: number) {
  const lines: string[] = [];
  let line = '',
    used = 0;
  for (const char of value.slice(0, 4000)) {
    const advance = size * (char.codePointAt(0)! >= 0x2e80 ? 1 : 0.55);
    if (char === '\n' || used + advance > width) {
      lines.push(line);
      if (lines.length === limit) {
        lines[limit - 1] += '…';
        return lines;
      }
      line = '';
      used = 0;
    }
    if (char !== '\n') {
      line += char;
      used += advance;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function nodeText(node: ObjectValue) {
  const pending = [node],
    parts: string[] = [];
  for (let i = 0; pending.length && i < 300; i++) {
    const current = pending.pop()!;
    if (typeof current.text === 'string') parts.push(current.text.slice(0, 4000));
    else pending.push(...children(current.children).reverse());
  }
  return parts.join('').slice(0, 4000);
}

function documentDrawing(title: string, payload: ObjectValue) {
  const blocks = children(object(object(payload.state).root).children);
  const parts = [
    rect(0, 0, 600, 360, 'var(--bg)'),
    rect(78, 18, 444, 540, 'var(--paper)', 'var(--border)'),
  ];
  let y = 47;
  const lines = (value: string, size: number, count: number, indent = 0, weight = 400) => {
    for (const line of wrap(value, size, 392 - indent, count)) {
      parts.push(text(104 + indent, y, line, size, 'var(--ink)', weight));
      y += size * 1.5;
    }
  };
  if (blocks[0]?.type !== 'heading') {
    lines(title, 18, 2, 0, 650);
    y += 7;
  }
  for (const block of blocks.slice(0, 18)) {
    if (y > 330) break;
    const type = string(block.type);
    if (type === 'heading') {
      const size = block.tag === 'h1' ? 18 : 11.5;
      y += block.tag === 'h1' ? 0 : 8;
      lines(nodeText(block), size, 2, 0, 650);
      y += 8;
    } else if (type === 'table') {
      const rows = children(block.children).slice(0, 5);
      const cols = Math.max(1, ...rows.map((row) => children(row.children).length));
      const width = 392 / cols;
      rows.forEach((row, ri) => {
        children(row.children).forEach((cell, ci) => {
          parts.push(
            rect(
              104 + ci * width,
              y - 8 + ri * 22,
              width,
              22,
              ri === 0 ? 'var(--block)' : 'var(--paper)',
              'var(--border)',
            ),
          );
          parts.push(
            text(
              109 + ci * width,
              y + 6 + ri * 22,
              wrap(nodeText(cell), 7.5, width - 10, 1)[0] ?? '',
              7.5,
            ),
          );
        });
      });
      y += rows.length * 22 + 10;
    } else if (type === 'list') {
      children(block.children)
        .slice(0, 4)
        .forEach((item, i) => {
          parts.push(text(104, y, block.listType === 'number' ? `${i + 1}.` : '•'));
          lines(nodeText(item), 9, 2, 13);
        });
      y += 8;
    } else if (type === 'alert-quote') {
      const body = children(object(object(block.content).root).children)
        .map(nodeText)
        .join(' ');
      const rows = wrap(body, 9, 368, 3);
      parts.push(
        rect(104, y - 8, 392, rows.length * 14 + 16, 'var(--alert)'),
        rect(104, y - 8, 2, rows.length * 14 + 16, '#c3986d'),
      );
      rows.forEach((line) => {
        parts.push(text(116, y + 7, line));
        y += 14;
      });
      y += 21;
    } else if (type === 'code-block') {
      const rows = wrap(string(block.code), 8, 372, 4);
      parts.push(rect(104, y - 8, 392, rows.length * 12 + 18, 'var(--block)'));
      rows.forEach((line) => {
        parts.push(text(114, y + 6, line, 8));
        y += 12;
      });
      y += 20;
    } else if (type === 'paragraph' || type === 'quote') {
      lines(nodeText(block), 9, 3);
      y += 7;
    } else {
      parts.push(
        rect(104, y - 8, 392, 30, 'var(--block)'),
        text(114, y + 11, type.toUpperCase().slice(0, 30), 8, 'var(--muted)'),
      );
      y += 40;
    }
  }
  return parts.join('');
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
function box(value: unknown): Box | null {
  const b = object(value);
  return [b.x, b.y, b.w, b.h].every(number) && (b.w as number) > 0 && (b.h as number) > 0
    ? (b as unknown as Box)
    : null;
}

function artboardDrawing(payload: ObjectValue) {
  const canvas = object(payload.canvas);
  const page = string(canvas.activePage) || string(children(canvas.pages)[0]?.id);
  const layout = object(object(object(payload.layout).pages)[page]);
  const boards = Object.values(object(canvas.boards))
    .slice(0, 2000)
    .map(object)
    .filter((b) => b.page === page && box(b));
  const noteRects = object(layout.notes),
    groupRects = object(layout.groups);
  const bounds = object(layout.bounds);
  let minX = bounds.minX,
    minY = bounds.minY,
    maxX = bounds.maxX,
    maxY = bounds.maxY;
  if (
    ![minX, minY, maxX, maxY].every(number) ||
    (maxX as number) <= (minX as number) ||
    (maxY as number) <= (minY as number)
  ) {
    if (!boards.length) return rect(0, 0, 600, 360, 'var(--bg)');
    minX = Math.min(...boards.map((b) => b.x as number));
    minY = Math.min(...boards.map((b) => b.y as number));
    maxX = Math.max(...boards.map((b) => (b.x as number) + (b.w as number)));
    maxY = Math.max(...boards.map((b) => (b.y as number) + (b.h as number)));
  }
  const width = Math.max(1, (maxX as number) - (minX as number)),
    height = Math.max(1, (maxY as number) - (minY as number));
  const scale = Math.min(556 / width, 316 / height);
  const tx = (600 - width * scale) / 2 - (minX as number) * scale;
  const ty = (360 - height * scale) / 2 - (minY as number) * scale;
  const shapes: string[] = [];
  for (const [id, value] of Object.entries(groupRects).slice(0, 200)) {
    const b = box(value);
    if (!b) continue;
    shapes.push(rect(b.x, b.y, b.w, b.h, 'none', 'var(--border)'));
    if (b.w * scale > 85)
      shapes.push(
        text(
          b.x + 12 / scale,
          b.y + 18 / scale,
          wrap(
            string(object(object(canvas.groups)[id]).title),
            7 / scale,
            b.w - 24 / scale,
            1,
          )[0] ?? '',
          7 / scale,
          'var(--muted)',
          550,
        ),
      );
  }
  for (const board of boards) {
    const b = box(board)!;
    shapes.push(rect(b.x, b.y, b.w, b.h, 'var(--paper)', 'var(--border)'));
    if (b.w * scale > 70)
      shapes.push(
        text(
          b.x,
          b.y - 5 / scale,
          wrap(string(board.title), 6 / scale, b.w, 1)[0] ?? '',
          6 / scale,
          'var(--muted)',
        ),
      );
  }
  for (const [id, value] of Object.entries(object(canvas.notes)).slice(0, 200)) {
    const note = object(value),
      b = box(noteRects[id]);
    if (note.page !== page || !b) continue;
    if (note.kind === 'sticky') {
      const color = /^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(string(note.color))
        ? string(note.color)
        : '#f0e2ad';
      shapes.push(rect(b.x, b.y, b.w, b.h, color));
      if (b.w * scale > 35)
        wrap(string(note.text), 4.7 / scale, b.w - 12 / scale, 3).forEach((line, i) => {
          shapes.push(
            text(b.x + 6 / scale, b.y + (10 + i * 7) / scale, line, 4.7 / scale, '#514a37'),
          );
        });
    } else {
      const size = number(note.size) && note.size > 0 ? note.size : 96;
      if (size * scale > 3)
        shapes.push(
          text(
            b.x,
            b.y + size,
            wrap(string(note.text), size, b.w, 1)[0] ?? '',
            size,
            'var(--muted)',
            600,
          ),
        );
    }
  }
  return `${rect(0, 0, 600, 360, 'var(--bg)')}<defs><pattern id="dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="var(--border)"/></pattern></defs>${rect(0, 0, 600, 360, 'url(#dots)')}<g transform="translate(${tx} ${ty}) scale(${scale})">${shapes.join('')}</g>`;
}

export function renderThumbnail(artifact: ThumbnailArtifact, value: unknown) {
  const title = artifact.title ?? artifact.id;
  let body: string;
  if (artifact.type === 'document') body = documentDrawing(title, object(value));
  else if (artifact.type === 'artboard') body = artboardDrawing(object(value));
  else {
    const key = `${artifact.project ?? ''}/${artifact.id}`;
    const index =
      [...key].reduce((hash, c) => (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0, 0) % 5;
    const light = ['#eee8e0', '#e6ece8', '#e9e8f0', '#e5ebed', '#f0e7e4'][index];
    const dark = ['#312b25', '#25312a', '#2c2937', '#263036', '#342824'][index];
    body = `<style>:root{--cover:${light}}@media (prefers-color-scheme: dark){:root{--cover:${dark}}}</style>${rect(0, 0, 600, 360, 'var(--cover)')}${text(42, 91, '</>', 44, 'var(--muted)', 500)}${wrap(
      title,
      25,
      505,
      3,
    )
      .map((line, i) => text(42, 160 + i * 36, line, 25, 'var(--ink)', 600))
      .join('')}${text(42, 318, `${artifact.project ?? 'RYUGI'} / HTML`, 11, 'var(--muted)')}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360"><title>${escape(title)}</title>${STYLE}${body}</svg>`;
}

export function renderBoardPlaceholder(board: {
  id: string;
  title?: string;
  w: number;
  h: number;
}) {
  const size = (value: number) =>
    Math.round(Number.isFinite(value) ? Math.min(1e5, Math.max(1, value)) : 1);
  const w = size(board.w),
    h = size(board.h);
  const font = Math.max(1, Math.round(Math.min(w / 14, h / 6)));
  const title = wrap(board.title || board.id, font, w * 0.8, 2);
  const top = h / 2 - (title.length * font * 1.25) / 2 + font * 0.8;
  const lines = title
    .map((line, i) => text(w / 2, top + i * font * 1.25, line, font, 'var(--ink)', 600))
    .join('');
  const id = board.title
    ? text(
        w / 2,
        top + title.length * font * 1.25 + font * 0.3,
        board.id,
        Math.max(1, Math.round(font * 0.55)),
        'var(--muted)',
      )
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><title>${escape(board.title || board.id)}</title>${STYLE}<style>text{text-anchor:middle}</style>${rect(0, 0, w, h, 'var(--paper)', 'var(--border)')}${lines}${id}</svg>`;
}
