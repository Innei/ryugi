#!/usr/bin/env bash
# Start the artifacts server for a project and print its connection info as JSON.
# Usage: start-server.sh [--project-dir <path>] [--artifact <type>/<id>] [--host <bind-host>]
#                        [--url-host <display-host>] [--idle-timeout-minutes <n>] [--open] [--no-open]
#                        [--foreground] [--background]
#
#   --project-dir <path>  Project root (default: current directory). Artifacts live in
#                         <path>/.ryugi/artifacts/<type>/<id>/ and persist after the server stops.
#   --artifact <t>/<id>   Also print "link", the URL that opens that artifact.
#   --host <bind-host>    Interface to bind (default 127.0.0.1). Use 0.0.0.0 in remote or
#                         containerized environments.
#   --url-host <host>     Hostname shown in the returned URL.
#   --idle-timeout-minutes <n>  Stop after n minutes without activity (default 240).
#   --open                Open the browser when the first artifact is ready (default).
#   --no-open             Do not open a browser (for headless or scripted use).
#   --foreground          Run in the current terminal instead of backgrounding.
#   --background          Force background mode (overrides the Codex/Windows auto-foreground).
#
# If a server is already running for the project, its info is printed with "reused": true.
# Every run registers the calling session as an owner; the server stops when all owners exit.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

PROJECT_DIR="$PWD"
FOREGROUND="false"
FORCE_BACKGROUND="false"
BIND_HOST="127.0.0.1"
URL_HOST=""
ARTIFACT=""
OPEN="${ARTIFACTS_OPEN:-1}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --artifact)
      if ! [[ "${2:-}" =~ ^(artboard|document|html)/[a-z0-9][a-z0-9-]*$ ]]; then
        echo '{"error": "--artifact must be <type>/<id>: type artboard, document or html, id of lowercase letters, digits and hyphens"}'
        exit 1
      fi
      ARTIFACT="$2"
      shift 2
      ;;
    --host) BIND_HOST="$2"; shift 2 ;;
    --url-host) URL_HOST="$2"; shift 2 ;;
    --idle-timeout-minutes)
      if ! [[ "$2" =~ ^[0-9]+$ ]] || [[ "$2" -lt 1 ]]; then
        echo '{"error": "--idle-timeout-minutes must be a positive integer"}'
        exit 1
      fi
      export ARTIFACTS_IDLE_TIMEOUT_MS=$(( $2 * 60 * 1000 ))
      shift 2
      ;;
    --open) OPEN=1; shift ;;
    --no-open) OPEN=0; shift ;;
    --foreground|--no-daemon) FOREGROUND="true"; shift ;;
    --background|--daemon) FORCE_BACKGROUND="true"; shift ;;
    *) echo "{\"error\": \"Unknown argument: $1\"}"; exit 1 ;;
  esac
done

if [[ -z "$URL_HOST" ]]; then
  if [[ "$BIND_HOST" == "127.0.0.1" || "$BIND_HOST" == "localhost" ]]; then
    URL_HOST="localhost"
  else
    URL_HOST="$BIND_HOST"
  fi
fi

is_windows_like_shell() {
  case "${OSTYPE:-}" in msys*|cygwin*|mingw*) return 0 ;; esac
  [[ -n "${MSYSTEM:-}" ]] && return 0
  case "$(uname -s 2>/dev/null || true)" in MSYS*|MINGW*|CYGWIN*) return 0 ;; esac
  return 1
}

# Codex and Windows/Git Bash reap background processes.
if [[ "$FOREGROUND" != "true" && "$FORCE_BACKGROUND" != "true" ]]; then
  if [[ -n "${CODEX_CI:-}" ]] || is_windows_like_shell; then
    FOREGROUND="true"
  fi
fi

# State files embed the session key; keep everything owner-only.
umask 077

if ! PROJECT_REAL="$(cd "$PROJECT_DIR" 2>/dev/null && pwd -P)"; then
  echo "{\"error\": \"Project directory not found: $PROJECT_DIR\"}"
  exit 1
fi
ROOT_DIR="$PROJECT_REAL/.ryugi/artifacts"
STATE_DIR="$ROOT_DIR/.state"
PID_FILE="$STATE_DIR/server.pid"
LOG_FILE="$STATE_DIR/server.log"
SERVER_ID_FILE="$STATE_DIR/server-instance-id"
INFO_FILE="$STATE_DIR/server-info"
VERSION_FILE="$STATE_DIR/server-version"
OWNERS_FILE="$STATE_DIR/owners"
mkdir -p "$STATE_DIR"
[[ -f "$STATE_DIR/.gitignore" ]] || printf '*\n' > "$STATE_DIR/.gitignore"

RELEASES_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/ryugi/artifacts"
LATEST_CHECK_MS=$((24 * 60 * 60 * 1000))
RETRY_CHECK_MS=$((60 * 60 * 1000))
SERVER_VERSION=""

# Modes: "cached" prints the release npm named within the last day; "checked <version>" records
# what npm just said. When npm or the install fails, "installed" falls back to the newest release
# already installed and records it so npm is asked again in an hour, not on every start.
latest_version() {
  node -e '(() => {
    const fs = require("node:fs");
    const path = require("node:path");
    const [releases, maxAge, retryAfter, mode, fresh] = process.argv.slice(1);
    const file = path.join(releases, "latest.json");
    const valid = (v) => /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(v || "");
    const record = (version, checkedAt) => {
      fs.mkdirSync(releases, { recursive: true });
      fs.writeFileSync(`${file}.${process.pid}`, JSON.stringify({ version, checkedAt }));
      fs.renameSync(`${file}.${process.pid}`, file);
    };
    if (mode === "cached") {
      try {
        const { version, checkedAt } = JSON.parse(fs.readFileSync(file, "utf8"));
        if (valid(version) && Date.now() - checkedAt < Number(maxAge)) console.log(version);
      } catch {}
      return;
    }
    if (mode === "checked" && valid(fresh)) {
      record(fresh, Date.now());
      return console.log(fresh);
    }
    const parts = (v) => v.split(/[-+]/)[0].split(".").map(Number);
    const newer = (a, b) => { const x = parts(a), y = parts(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
    let installed = [];
    try { installed = fs.readdirSync(releases).filter((v) => valid(v) && fs.existsSync(path.join(releases, v, "node_modules/ryugi-artifacts/dist/server.cjs"))); } catch {}
    const newest = installed.sort(newer).pop();
    if (!newest) return;
    record(newest, Date.now() - Number(maxAge) + Number(retryAfter));
    console.log(newest);
  })()' "$RELEASES_DIR" "$LATEST_CHECK_MS" "$RETRY_CHECK_MS" "$@"
}

use_release() {
  SERVER_VERSION="$1"
  SERVER="$RELEASES_DIR/$1/node_modules/ryugi-artifacts/dist/server.cjs"
}

# A local build (pnpm build:server) wins; otherwise run the newest ryugi-artifacts release,
# installed once per version. Runs before the project lock: a slow install must not outlive
# the lock's stale threshold. npm installs into a staging dir that is renamed into place;
# rename(2) refuses a non-empty target, so a concurrent start that finished first keeps its install.
resolve_server() {
  if [[ -f "$SCRIPT_DIR/server.cjs" ]]; then
    SERVER="$SCRIPT_DIR/server.cjs"
    return 0
  fi
  local version cache staging fallback
  version="$(latest_version cached)"
  [[ -n "$version" ]] || version="$(latest_version checked "$(npm view ryugi-artifacts version --prefer-online --fetch-retries=0 --fetch-timeout=10000 2>/dev/null | tail -1 | tr -d '[:space:]')")"
  if [[ -z "$version" ]]; then
    node -e 'console.log(JSON.stringify({ error: `Could not reach npm for the latest ryugi-artifacts; the first start needs network access and a writable ${process.argv[1]}, so rerun outside the sandbox.` }))' "$RELEASES_DIR"
    return 1
  fi
  use_release "$version"
  cache="$RELEASES_DIR/$version"
  [[ -f "$SERVER" ]] && return 0
  staging="$cache.install.$$"
  rm -rf "$staging"
  mkdir -p "$staging"
  if ! npm install --prefix "$staging" --no-save --no-package-lock --no-audit --no-fund --loglevel=error \
      "ryugi-artifacts@$version" > "$staging.log" 2>&1 || [[ ! -f "$staging/node_modules/ryugi-artifacts/dist/server.cjs" ]]; then
    fallback="$(latest_version installed)"
    if [[ -n "$fallback" ]]; then
      rm -rf "$staging" "$staging.log"
      use_release "$fallback"
      return 0
    fi
    node -e 'console.log(JSON.stringify({ error: `Could not install ${process.argv[1]} from npm; the first start of each version needs network access and a writable ${process.argv[2]}, so rerun outside the sandbox. npm: ${process.argv[3].trim().split("\n").pop() || "failed"}` }))' \
      "ryugi-artifacts@$version" "$(dirname "$cache")" "$(cat "$staging.log")"
    rm -rf "$staging" "$staging.log"
    return 1
  fi
  rm -f "$staging.log"
  node -e 'try { require("node:fs").renameSync(process.argv[1], process.argv[2]) } catch {}' "$staging" "$cache"
  rm -rf "$staging"
  [[ -f "$SERVER" ]] && return 0
  echo "{\"error\": \"Installed ryugi-artifacts@$version but could not move it into $cache\"}"
  return 1
}

resolve_server || exit 1

# Concurrent runs for one project must not both spawn a server: hold a lock from the
# running-server check until the new server has written server-info.
LOCK_DIR="$STATE_DIR/start.lock"
release_lock() { rmdir "$LOCK_DIR" 2>/dev/null; return 0; }
acquire_lock() {
  local _
  for _ in {1..150}; do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      trap release_lock EXIT
      return 0
    fi
    if [[ -n "$(find "$LOCK_DIR" -maxdepth 0 -mmin +1 2>/dev/null)" ]]; then
      rmdir "$LOCK_DIR" 2>/dev/null
      continue
    fi
    sleep 0.1
  done
  return 1
}
if ! acquire_lock; then
  echo '{"error": "Another start-server.sh run for this project is still starting; retry in a moment"}'
  exit 1
fi

command_has_server_id() {
  local pid="$1" expected_arg="--artifacts-server-id=$2" arg command_line
  if [[ -r "/proc/$pid/cmdline" ]]; then
    while IFS= read -r -d '' arg || [[ -n "$arg" ]]; do
      [[ "$arg" == "$expected_arg" ]] && return 0
    done < "/proc/$pid/cmdline"
    return 1
  fi
  command_line="$(ps -ww -p "$pid" -o command= 2>/dev/null || ps -f -p "$pid" 2>/dev/null | sed '1d' || true)"
  case " $command_line " in
    *" $expected_arg "*) return 0 ;;
    *) return 1 ;;
  esac
}

running_server_pid() {
  [[ -f "$PID_FILE" && -f "$SERVER_ID_FILE" ]] || return 1
  local pid id
  pid="$(cat "$PID_FILE")"
  id="$(tr -d '\r\n' < "$SERVER_ID_FILE")"
  kill -0 "$pid" 2>/dev/null || return 1
  command_has_server_id "$pid" "$id" || return 1
  echo "$pid"
}

# $PPID is the throwaway shell the harness spawned for this script; the harness is its parent.
OWNER_PID="$(ps -o ppid= -p "$PPID" 2>/dev/null | tr -d ' ')"
if [[ -z "$OWNER_PID" || "$OWNER_PID" == "1" ]]; then
  OWNER_PID="$PPID"
fi
# Node cannot see MSYS2 PIDs; an unverifiable owner would stop the server at the first check.
if is_windows_like_shell; then
  OWNER_PID=""
fi

register_owner() {
  local tmp="$OWNERS_FILE.$$" pid
  {
    if [[ -f "$OWNERS_FILE" ]]; then
      while IFS= read -r pid; do
        [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null && printf '%s\n' "$pid"
      done < "$OWNERS_FILE"
    fi
    [[ -n "$OWNER_PID" ]] && printf '%s\n' "$OWNER_PID"
  } | sort -u > "$tmp"
  mv "$tmp" "$OWNERS_FILE"
}

# Prints the server info JSON with "link" for --artifact, and "reused" when $1 is true.
emit_info() {
  node -e '
    const [json, reused, artifact] = process.argv.slice(1);
    const info = JSON.parse(json);
    if (reused === "true") info.reused = true;
    if (artifact) {
      const url = new URL(info.url);
      info.link = `${url.origin}/${artifact}?key=${url.searchParams.get("key")}`;
    }
    console.log(JSON.stringify(info));
  ' "$1" "$2" "$ARTIFACT"
}

# A server from an older release is replaced; the new one keeps its port and key, so open tabs reconnect.
if RUNNING_PID="$(running_server_pid)" && [[ -f "$INFO_FILE" ]]; then
  if [[ -z "$SERVER_VERSION" || "$(cat "$VERSION_FILE" 2>/dev/null)" == "$SERVER_VERSION" ]]; then
    register_owner
    emit_info "$(cat "$INFO_FILE")" true
    exit 0
  fi
  kill -TERM "$RUNNING_PID" 2>/dev/null
  for _ in {1..50}; do
    kill -0 "$RUNNING_PID" 2>/dev/null || break
    sleep 0.1
  done
  if kill -0 "$RUNNING_PID" 2>/dev/null; then
    kill -KILL "$RUNNING_PID" 2>/dev/null
    for _ in {1..20}; do
      kill -0 "$RUNNING_PID" 2>/dev/null || break
      sleep 0.1
    done
  fi
  if kill -0 "$RUNNING_PID" 2>/dev/null; then
    echo "{\"error\": \"The running server (pid $RUNNING_PID) is on an older release and did not stop; stop it with stop-server.sh and retry\"}"
    exit 1
  fi
fi

register_owner
rm -f "$INFO_FILE"

SERVER_ID=""
if [[ -r /dev/urandom ]]; then
  SERVER_ID="$(od -An -N24 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n' || true)"
fi
if ! [[ "$SERVER_ID" =~ ^[A-Za-z0-9_-]{32,64}$ ]]; then
  SERVER_ID="$(printf '%08x%08x%08x%08x' "$$" "$(date +%s)" "${RANDOM:-0}" "${RANDOM:-0}")"
fi
printf '%s\n' "$SERVER_ID" > "$SERVER_ID_FILE"
printf '%s\n' "$SERVER_VERSION" > "$VERSION_FILE"

SERVER_ENV=(ARTIFACTS_ROOT="$ROOT_DIR" ARTIFACTS_HOST="$BIND_HOST" ARTIFACTS_URL_HOST="$URL_HOST" ARTIFACTS_OPEN="$OPEN")
[[ -n "$ARTIFACT" ]] && SERVER_ENV+=(ARTIFACTS_OPEN_ARTIFACT="$ARTIFACT")

if [[ "$FOREGROUND" == "true" ]]; then
  env "${SERVER_ENV[@]}" node "$SERVER" "--artifacts-server-id=$SERVER_ID" &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"
  trap 'kill -TERM "$SERVER_PID" 2>/dev/null || true' INT TERM
  for _ in {1..50}; do
    [[ -f "$INFO_FILE" ]] && break
    sleep 0.1
  done
  release_lock
  trap - EXIT
  wait "$SERVER_PID"
  exit $?
fi

nohup env "${SERVER_ENV[@]}" node "$SERVER" "--artifacts-server-id=$SERVER_ID" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
disown "$SERVER_PID" 2>/dev/null
echo "$SERVER_PID" > "$PID_FILE"

for _ in {1..50}; do
  if grep -q '"server-started"' "$LOG_FILE" 2>/dev/null; then
    for _ in {1..20}; do
      if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        echo "{\"error\": \"Server started but was killed. Retry in a persistent terminal with: $SCRIPT_DIR/start-server.sh --project-dir $PROJECT_REAL --host $BIND_HOST --url-host $URL_HOST --foreground\"}"
        exit 1
      fi
      sleep 0.1
    done
    emit_info "$(grep '"server-started"' "$LOG_FILE" | head -1)" false
    exit 0
  fi
  if grep -q '"server-error"' "$LOG_FILE" 2>/dev/null; then
    grep '"server-error"' "$LOG_FILE" | head -1
    exit 1
  fi
  sleep 0.1
done

echo '{"error": "Server failed to start within 5 seconds"}'
exit 1
