#!/usr/bin/env bash
# Start the Artboard server for a project and print its connection info as JSON.
# Usage: start-server.sh [--project-dir <path>] [--host <bind-host>] [--url-host <display-host>]
#                        [--idle-timeout-minutes <n>] [--open] [--foreground] [--background]
#
#   --project-dir <path>  Project root (default: current directory). The board lives in
#                         <path>/.ryugi/artboard/ and persists after the server stops.
#   --host <bind-host>    Interface to bind (default 127.0.0.1). Use 0.0.0.0 in remote or
#                         containerized environments.
#   --url-host <host>     Hostname shown in the returned URL.
#   --idle-timeout-minutes <n>  Stop after n minutes without activity (default 240).
#   --open                Open the browser when the first board appears.
#   --foreground          Run in the current terminal instead of backgrounding.
#   --background          Force background mode (overrides the Codex/Windows auto-foreground).
#
# If a server is already running for the project, its info is printed with "reused": true.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

PROJECT_DIR="$PWD"
FOREGROUND="false"
FORCE_BACKGROUND="false"
BIND_HOST="127.0.0.1"
URL_HOST=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --host) BIND_HOST="$2"; shift 2 ;;
    --url-host) URL_HOST="$2"; shift 2 ;;
    --idle-timeout-minutes)
      if ! [[ "$2" =~ ^[0-9]+$ ]] || [[ "$2" -lt 1 ]]; then
        echo '{"error": "--idle-timeout-minutes must be a positive integer"}'
        exit 1
      fi
      export ARTBOARD_IDLE_TIMEOUT_MS=$(( $2 * 60 * 1000 ))
      shift 2
      ;;
    --open) export ARTBOARD_OPEN=1; shift ;;
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
BOARD_DIR="$PROJECT_REAL/.ryugi/artboard"
STATE_DIR="$BOARD_DIR/state"
PID_FILE="$STATE_DIR/server.pid"
LOG_FILE="$STATE_DIR/server.log"
SERVER_ID_FILE="$STATE_DIR/server-instance-id"
INFO_FILE="$STATE_DIR/server-info"
mkdir -p "$STATE_DIR"

command_has_server_id() {
  local pid="$1" expected_arg="--artboard-server-id=$2" arg command_line
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

if running_server_pid >/dev/null && [[ -f "$INFO_FILE" ]]; then
  node -e 'const i = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(JSON.stringify({ ...i, reused: true }));' "$INFO_FILE"
  exit 0
fi

SERVER_ID=""
if [[ -r /dev/urandom ]]; then
  SERVER_ID="$(od -An -N24 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n' || true)"
fi
if ! [[ "$SERVER_ID" =~ ^[A-Za-z0-9_-]{32,64}$ ]]; then
  SERVER_ID="$(printf '%08x%08x%08x%08x' "$$" "$(date +%s)" "${RANDOM:-0}" "${RANDOM:-0}")"
fi
printf '%s\n' "$SERVER_ID" > "$SERVER_ID_FILE"

# $PPID is the throwaway shell the harness spawned for this script; the harness is its parent.
OWNER_PID="$(ps -o ppid= -p "$PPID" 2>/dev/null | tr -d ' ')"
if [[ -z "$OWNER_PID" || "$OWNER_PID" == "1" ]]; then
  OWNER_PID="$PPID"
fi
# Node cannot see MSYS2 PIDs; an unverifiable owner would stop the server at the first check.
if is_windows_like_shell; then
  OWNER_PID=""
fi

cd "$SCRIPT_DIR" || exit 1
SERVER_ENV=(ARTBOARD_DIR="$BOARD_DIR" ARTBOARD_HOST="$BIND_HOST" ARTBOARD_URL_HOST="$URL_HOST" ARTBOARD_OWNER_PID="$OWNER_PID")

if [[ "$FOREGROUND" == "true" ]]; then
  env "${SERVER_ENV[@]}" node server.cjs "--artboard-server-id=$SERVER_ID" &
  SERVER_PID=$!
  echo "$SERVER_PID" > "$PID_FILE"
  wait "$SERVER_PID"
  exit $?
fi

nohup env "${SERVER_ENV[@]}" node server.cjs "--artboard-server-id=$SERVER_ID" > "$LOG_FILE" 2>&1 &
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
    grep '"server-started"' "$LOG_FILE" | head -1
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
