# shellcheck shell=bash
# Mirrors projectPaths in artifacts/src/cli/paths.ts: hooks must find the server the CLI started.

# Git Bash's pwd prints /c/Users/...; native node.exe only understands C:/Users/...
ryugi_native_path() {
  if command -v cygpath > /dev/null 2>&1; then cygpath -m "$1"; else printf '%s\n' "$1"; fi
}

ryugi_real_dir() {
  local real
  real="$(cd "$1" 2> /dev/null && pwd -P)" || {
    printf '%s\n' "$1"
    return
  }
  ryugi_native_path "$real"
}

# Claude Code can run hooks with an empty PATH, so the walk uses no external commands.
ryugi_project_root() {
  local dir current parent home saved=""
  dir="$(cd "$1" 2> /dev/null && pwd -P)" || {
    printf '%s\n' "$1"
    return
  }
  home="$(cd "${HOME:-/nonexistent}" 2> /dev/null && pwd -P)"
  current="$dir"
  while :; do
    [ -z "$saved" ] && [ -d "$current/.ryugi/artifacts" ] && saved="$current"
    if [ -e "$current/.git" ] && { [ "$current" != "$home" ] || [ "$dir" = "$home" ]; }; then
      ryugi_native_path "${saved:-$current}"
      return
    fi
    parent="${current%/*}"
    [ -n "$parent" ] || parent=/
    [ "$parent" = "$current" ] && break
    current="$parent"
  done
  ryugi_native_path "$dir"
}
