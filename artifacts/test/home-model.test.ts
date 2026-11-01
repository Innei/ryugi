import { expect, test } from 'vitest';

import type { HubArtifact, HubProjectStatus } from '../src/shared/hub';
import { homeArtifacts, paletteGroups, splitProjects } from '../src/viewer/layouts/home/home-model';

const project = (dir: string, dormant = false): HubProjectStatus => ({
  dir,
  name: dir.split('/').pop()!,
  lastUsedAt: 0,
  dormant,
  artifacts: 0,
});

const artifact = (
  projectDir: string,
  id: string,
  title: string,
  updatedAt: number,
): HubArtifact => ({
  project: projectDir,
  type: 'artboard',
  id,
  title,
  updatedAt,
  url: `/artboard/${id}`,
});

const list = [
  artifact('/p/one', 'signup', 'Signup flow', 300),
  artifact('/p/two', 'pricing', 'Pricing page', 200),
  artifact('/p/one', 'settings', 'Settings nav', 100),
];

test('recent shows every project', () => {
  expect(homeArtifacts(list, { selection: 'recent', scope: 'project', query: '' })).toEqual(list);
});

test('a selected project shows only its artifacts', () => {
  expect(
    homeArtifacts(list, { selection: '/p/one', scope: 'project', query: '' }).map((a) => a.id),
  ).toEqual(['signup', 'settings']);
});

test('searching all projects reaches past the selected one', () => {
  expect(
    homeArtifacts(list, { selection: '/p/one', scope: 'all', query: 'pric' }).map((a) => a.id),
  ).toEqual(['pricing']);
  expect(
    homeArtifacts(list, { selection: '/p/one', scope: 'project', query: 'pric' }).map((a) => a.id),
  ).toEqual([]);
});

test('dormant projects fold away from the active ones', () => {
  const { active, dormant } = splitProjects([project('/p/one'), project('/p/old', true)]);
  expect(active.map((p) => p.dir)).toEqual(['/p/one']);
  expect(dormant.map((p) => p.dir)).toEqual(['/p/old']);
});

test('the palette groups matches by project, in project order', () => {
  const groups = paletteGroups(list, [project('/p/two'), project('/p/one')], 'i');
  expect(groups.map((g) => [g.project.dir, g.items.map((a) => a.id)])).toEqual([
    ['/p/two', ['pricing']],
    ['/p/one', ['signup', 'settings']],
  ]);
});

test('the palette leaves out projects without a match', () => {
  const groups = paletteGroups(list, [project('/p/two'), project('/p/one')], 'signup');
  expect(groups.map((g) => g.project.dir)).toEqual(['/p/one']);
});
