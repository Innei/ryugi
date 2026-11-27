# shellcheck shell=bash
test_hook_bin() {
  if [ -n "${RYUGI_HOOK_BIN:-}" ]; then
    printf '%s\n' "$RYUGI_HOOK_BIN"
    return
  fi
  cargo build --quiet --manifest-path "$1/hook/Cargo.toml" >&2 || return 1
  printf '%s\n' "$1/hook/target/debug/adeck-hook"
}
