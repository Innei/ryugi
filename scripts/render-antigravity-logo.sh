#!/usr/bin/env bash
#
# Render the Antigravity Marketplace logo from assets/logo/ryugi-icon.svg.
#
# Usage:
#   scripts/render-antigravity-logo.sh [--output PATH]
#
# The mark is a raster painting (the kitsune crest) wrapped as an SVG, so this
# is a plain 512x512 render of the icon tile, with the rounded corners keeping
# their transparency. Run it whenever the icon changes;
# tests/antigravity/test-logo.sh fails if the committed PNG is stale.
# Requires rsvg-convert (Homebrew: librsvg).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_SVG="$REPO_ROOT/assets/logo/ryugi-icon.svg"
OUTPUT="$REPO_ROOT/assets/antigravity-logo.png"

usage() {
  sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
}

die() {
  echo "error: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)
      [[ $# -ge 2 ]] || die "--output needs a path"
      OUTPUT="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown argument: $1"
      ;;
  esac
done

command -v rsvg-convert >/dev/null 2>&1 \
  || die "rsvg-convert is not on PATH (install librsvg, e.g. 'brew install librsvg')"
[[ -r "$SOURCE_SVG" ]] || die "icon source not readable: $SOURCE_SVG"

rsvg-convert -w 512 -h 512 "$SOURCE_SVG" -o "$OUTPUT"
echo "wrote $OUTPUT"
