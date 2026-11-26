#!/usr/bin/env bash
#
# Render the Antigravity Marketplace logo from assets/app-icon.svg.
#
# Usage:
#   scripts/render-antigravity-logo.sh [--output PATH]
#
# Draws the app icon inset to a 450-unit rounded square with transparent
# corners, 512x512 PNG. Run it whenever app-icon.svg changes;
# tests/antigravity/test-logo.sh fails if the committed PNG is stale.
# Requires rsvg-convert (Homebrew: librsvg).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_SVG="$REPO_ROOT/assets/app-icon.svg"
OUTPUT="$REPO_ROOT/assets/antigravity-logo.png"

usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
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

command -v rsvg-convert > /dev/null 2>&1 \
  || die "rsvg-convert is not on PATH (install librsvg, e.g. 'brew install librsvg')"
[[ -r "$SOURCE_SVG" ]] || die "source icon not readable: $SOURCE_SVG"

icon="$(sed -E 's/^<svg[^>]*>//; s#</svg>[[:space:]]*$##' "$SOURCE_SVG")"
[[ -n "$icon" ]] || die "could not extract the icon from $SOURCE_SVG"

composed="$(mktemp)"
trap 'rm -f "$composed"' EXIT
cat > "$composed" << EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <svg x="31" y="31" width="450" height="450" viewBox="0 0 512 512" fill="none">$icon</svg>
</svg>
EOF

rsvg-convert -w 512 -h 512 "$composed" -o "$OUTPUT"
echo "wrote $OUTPUT"
