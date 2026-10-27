import { expect, test } from 'vitest';

import { i18n } from '../src/viewer/i18n';
import { filterArtifacts, relativeUpdatedAt } from '../src/viewer/lib/artifact-list';

const artifacts = [
  { type: 'html' as const, id: 'easing-lab', title: 'Motion study', updatedAt: 200 },
  { type: 'document' as const, id: 'design-notes', title: '设计说明', updatedAt: 300 },
  { type: 'artboard' as const, id: 'homepage', title: 'Homepage', updatedAt: 100 },
];

test('searches titles and ids, combines the type filter and sorts recent work first', () => {
  expect(filterArtifacts(artifacts, 'all', '').map((a) => a.id)).toEqual([
    'design-notes',
    'easing-lab',
    'homepage',
  ]);
  expect(filterArtifacts(artifacts, 'all', '  EASING ')).toEqual([artifacts[0]]);
  expect(filterArtifacts(artifacts, 'document', '设计')).toEqual([artifacts[1]]);
  expect(filterArtifacts(artifacts, 'html', '设计')).toEqual([]);
  expect(artifacts[0]!.id).toBe('easing-lab');
});

test('relative times handle fresh updates, elapsed time and future file timestamps', () => {
  const now = Date.parse('2026-10-20T08:00:00Z');
  expect(relativeUpdatedAt(now, now)).toBe('just now');
  expect(relativeUpdatedAt(now + 60000, now)).toBe('just now');
  expect(relativeUpdatedAt(now - 60000, now)).toBe('1 minute ago');
  expect(relativeUpdatedAt(now - 3600000, now)).toBe('1 hour ago');
});

test('relative times follow the viewer language', async () => {
  const now = Date.parse('2026-10-20T08:00:00Z');
  await i18n.changeLanguage('zh');
  try {
    expect(relativeUpdatedAt(now, now)).toBe('刚刚');
    expect(relativeUpdatedAt(now - 60000, now)).toBe('1分钟前');
  } finally {
    await i18n.changeLanguage('en');
  }
});

test('sorts by oldest update or name while preserving search and type filters', () => {
  const items = artifacts.map((artifact) => ({
    ...artifact,
    title: artifact.id === 'design-notes' ? 'Alpha notes' : artifact.title,
  }));
  expect(filterArtifacts(items, 'all', '', 'oldest').map((a) => a.id)).toEqual([
    'homepage',
    'easing-lab',
    'design-notes',
  ]);
  expect(filterArtifacts(items, 'all', '', 'name').map((a) => a.id)).toEqual([
    'design-notes',
    'homepage',
    'easing-lab',
  ]);
  expect(filterArtifacts(items, 'html', 'study', 'oldest')).toEqual([items[0]]);
  expect(items.map((a) => a.id)).toEqual(['easing-lab', 'design-notes', 'homepage']);
});
