export const CLOUD_SHIPPED_PATHS = ['packages/artifacts', 'packages/shared', 'daemon'];
export const CLOUD_HIDDEN_SCOPES = new Set([
  'release',
  'ci',
  'web',
  'landing',
  'admin',
  'billing',
  'monitor',
  'worker',
  'seo',
  'legal',
]);

function pathArea(file) {
  if (/(?:^|\/)daemon\//.test(file)) return 'Daemon';
  if (/^packages\/artifacts\/src\/core\/(?:cli|server)\/.*(?:cloud|publish|share|relay)/.test(file))
    return 'Cloud links';
  if (
    file.startsWith('packages/shared/') ||
    /^packages\/artifacts\/src\/(?:core\/viewer|artboard|document|html|mockup|report|slides|storyboard|verify|whiteboard)\//.test(
      file,
    )
  )
    return 'Viewer';
  return 'Hub & CLI';
}

export function privateArea(parsed, files, scopeArea) {
  if (parsed.scope !== 'artifacts' && scopeArea[parsed.scope]) return scopeArea[parsed.scope];
  const counts = new Map();
  for (const f of files) {
    if (!CLOUD_SHIPPED_PATHS.some((p) => f.startsWith(`${p}/`))) continue;
    const area = pathArea(f);
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Hub & CLI';
}
