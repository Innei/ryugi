import type { HubArtifact, HubProjectStatus } from '../../../shared/hub';
import { filterArtifacts } from '../../lib/artifact-list';

export type HomeSelection = 'recent' | (string & {});
export type SearchScope = 'project' | 'all';

export function homeArtifacts(
  list: HubArtifact[],
  view: { selection: HomeSelection; scope: SearchScope; query: string },
) {
  const everywhere =
    view.selection === 'recent' || (view.scope === 'all' && view.query.trim() !== '');
  const scoped = everywhere ? list : list.filter((a) => a.project === view.selection);
  return view.query.trim() ? filterArtifacts(scoped, 'all', view.query) : scoped;
}

export function splitProjects(projects: HubProjectStatus[]) {
  return {
    active: projects.filter((p) => !p.dormant),
    dormant: projects.filter((p) => p.dormant),
  };
}

export function paletteGroups(list: HubArtifact[], projects: HubProjectStatus[], query: string) {
  const matches = filterArtifacts(list, 'all', query);
  return projects
    .map((project) => ({
      project,
      items: matches.filter((a) => a.project === project.dir),
    }))
    .filter((group) => group.items.length > 0);
}
