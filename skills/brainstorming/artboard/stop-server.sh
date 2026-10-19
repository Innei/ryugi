#!/usr/bin/env bash
# Stop the Artboard server for a project. The board directory is kept.
# Usage: stop-server.sh [<project-dir>]   (default: current directory)

PROJECT_DIR="${1:-$PWD}"
if ! PROJECT_REAL="$(cd "$PROJECT_DIR" 2>/dev/null && pwd -P)"; then
  echo "{\"error\": \"Project directory not found: $PROJECT_DIR\"}"
  exit 1
fi

STATE_DIR="$PROJECT_REAL/.ryugi/artboard/state"
PID_FILE="$STATE_DIR/server.pid"
SERVER_ID_FILE="$STATE_DIR/server-instance-id"

mark_stopped() {
  rm -f "$STATE_DIR/server-info"
  printf '{"reason":"%s","timestamp":%s}\n' "$1" "$(date +%s)" > "$STATE_DIR/server-stopped"
}

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

# Only signal a PID whose command line carries this board's per-start server id:
# a stale pid file can point at an unrelated process after a reboot.
is_artboard_server() {
  kill -0 "$1" 2>/dev/null || return 1
  [[ -f "$SERVER_ID_FILE" ]] || return 1
  local id
  id="$(tr -d '\r\n' < "$SERVER_ID_FILE")"
  [[ "$id" =~ ^[A-Za-z0-9_-]{32,64}$ ]] || return 1
  command_has_server_id "$1" "$id"
}

if [[ ! -f "$PID_FILE" ]]; then
  echo '{"status": "not_running"}'
  exit 0
fi

pid="$(cat "$PID_FILE")"
if ! is_artboard_server "$pid"; then
  rm -f "$PID_FILE" "$SERVER_ID_FILE"
  mark_stopped "stale_pid"
  echo '{"status": "stale_pid"}'
  exit 0
fi

kill "$pid" 2>/dev/null || true
for _ in {1..20}; do
  kill -0 "$pid" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "$pid" 2>/dev/null; then
  kill -9 "$pid" 2>/dev/null || true
  sleep 0.1
fi
if kill -0 "$pid" 2>/dev/null; then
  echo '{"status": "failed", "error": "process still running"}'
  exit 1
fi

rm -f "$PID_FILE" "$SERVER_ID_FILE" "$STATE_DIR/server.log"
mark_stopped "stop-server.sh"
echo '{"status": "stopped"}'
