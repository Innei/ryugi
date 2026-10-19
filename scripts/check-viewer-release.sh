#!/usr/bin/env bash
#
# check-viewer-release.sh — fail when artifacts/src changed since the last
# release tag but the version was not bumped. Users install from main and
# load the viewer pinned to that version from the CDN, so an unreleased
# viewer change would pair a new server.cjs with an old viewer.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

version="$(jq -r '.version' artifacts/package.json)"

if [[ "${1:-}" == "--require-tag" ]] && ! git rev-parse -q --verify "refs/tags/v$version" >/dev/null; then
  echo "error: main is at version $version but tag v$version does not exist, so the CDN has no viewer for it." >&2
  echo "Push the tag with the commit: git push --atomic origin main v$version" >&2
  exit 1
fi

tag="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"
if [[ -z "$tag" ]]; then
  echo "No release tag yet; nothing to compare."
  exit 0
fi

if [[ "v$version" != "$tag" ]]; then
  echo "Version $version is ahead of $tag; it ships as a new release."
  exit 0
fi

if git diff --quiet "$tag" HEAD -- artifacts/src; then
  echo "artifacts/src unchanged since $tag."
  exit 0
fi

echo "error: artifacts/src changed since $tag but the version is still $version." >&2
echo "Run scripts/bump-version.sh <next-version> and release it, or the CDN keeps serving the $tag viewer." >&2
git diff --stat "$tag" HEAD -- artifacts/src >&2
exit 1
