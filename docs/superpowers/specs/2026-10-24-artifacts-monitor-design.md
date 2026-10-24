# Artifacts server monitor and project-root resolution

## Intent

Agents start artifacts servers in the background, so nobody can see which projects have one running. The CLI gains a `monitor` command that lists every running server on the machine, says which ones are safe to stop, and manages them. Each project keeps exactly one server.

## Decisions

### One server per project (already true)

- `start` already takes `.state/start.lock`, validates the running pid by its `--artifacts-server-id`, and reuses it (`reused: true`, same port and key). That stays.

### Deferred: resolving subdirectories to the repository root

Agreed, then split out during implementation. Resolving `--project-dir` to the git root (nearest existing `.ryugi/artifacts/` below it wins) also needs:

- the skill (`SKILL.md`, `artboard.md`, `document.md`, `html.md`) to write under the `root` that `start` prints instead of `<project>/.ryugi/artifacts/`, with a baseline and after run per `AGENTS.md`;
- the hooks (`stop`, `user-prompt-submit`, `selection-context.cjs`, `flush-artifacts.cjs`, `start-artifacts.cjs`), which read `$CLAUDE_PROJECT_DIR/.ryugi/artifacts` directly and would miss a server resolved to a parent directory.

Shipping the CLI part alone breaks selections, comment reminders and auto-publish for sessions opened in a subdirectory. Until then the monitor shows such duplicates as separate rows.

### Global registry

- Location: `/tmp/ryugi-<uid>/servers/` (mode 0700) on macOS/Linux, `<os.tmpdir()>/ryugi/servers/` on Windows. Not `$TMPDIR`: harnesses set it per session, which would split the list. Not `~/.config`: sandboxes often cannot write there, and entries should vanish on reboot like the servers do. `RYUGI_RUNTIME_DIR` overrides it (tests).
- One file per server, `<sha256(projectRoot) first 16 hex>.json`: `{ project, root, pid, serverId, version, startedAt }`. A pointer only; `server-info` in the project stays the source of truth for URL and key.
- The server writes its own entry after it listens, touches it on every lifecycle tick (macOS deletes `/tmp` files untouched for 3 days), and removes it on shutdown. Written by the server rather than `start`, so foreground and background servers both register.
- Readers validate each entry with `hasServerId(pid, serverId)` and delete entries that fail. A lost or stale entry never shows a wrong state.
- Servers from releases before this change do not register and do not appear. Accepted.

### Server status endpoint

- `GET /api/status?key=<key>` returns `{ pid, version, startedAt, lastActivity, clients, idleTimeoutMs }`. `clients` is the open browser tab count (`clientCount()`). Same key check as the agent routes.

### `ryugi-artifacts monitor`

- In a TTY: full-screen TUI on the alternate screen, refreshed every 2 s. Columns: project (home shortened to `~`), port, pid, uptime, tabs, idle, version, and a state tag (`safe to stop`, `old release`, `no status` when the endpoint is missing or unreachable).
- Keys: `↑/↓` (`j/k` too) select, `o` open in browser, `c` copy URL (pbcopy / clip / wl-copy / xclip; fall back to showing the URL), `l` log view, `x` stop selected, `X` stop every `safe to stop` server, `q`/Ctrl+C quit. Stop goes through the existing `stop()` for that project.
- `x`/`X` ask for a one-key confirmation in the footer (`y` to confirm). *(Claude's call: it kills a process another agent session may be using.)*
- **Safe to stop** = `clients === 0` and idle ≥ 30 minutes. *(Claude's call.)*
- Log view: last lines of `.state/server.log`, follows new lines, `Esc`/`q` goes back. A foreground server has no log file (its output is in its own terminal); the view says so.
- Not a TTY, or `--json`: print the list once and exit. JSON: one line `{ "type": "servers", "servers": [...] }`; text: one line per server.
- No TUI library: Node `readline.emitKeypressEvents`, raw mode and ANSI escapes. Restore the terminal on exit, crash and SIGTERM.

## Non-goals

- Starting servers from the monitor.
- Managing servers on other machines or other users' servers.
- Showing servers from releases that predate the registry.

## Anti-goals

- The monitor listing a dead server as running, or hiding a live one it has an entry for.
- A second server for the same project directory.
- An agent writing artifacts into a directory the server does not watch.
- A crashed monitor leaving the terminal in raw mode.

## Left to the builder

- Module split under `artifacts/src/cli/` and `src/server/` within the 500-line / file limit.
- Exact column widths, truncation and colors.
- Text output format of the non-TTY list.
- `--help` wording and the `docs/artifacts-cli.md` / `docs/testing.md` updates.
- Version bump and release follow `AGENTS.md` after the change lands.
