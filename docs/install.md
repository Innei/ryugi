# Installing Ryugi

Use the unified installer with Node.js 20.12 or newer:

```bash
npx ryugi-artifacts install
```

The terminal wizard selects Artifacts or Full workflow, then one or more detected
harnesses. It installs a persistent CLI and shows the plan before applying it.
Supported targets: Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Pi and GitHub
Copilot CLI. Leave the target selection empty for CLI only. Scripts use explicit
choices:

```bash
npx ryugi-artifacts install --mode artifacts --harness codex,pi
npx ryugi-artifacts install --mode full --harness claude-code
npx ryugi-artifacts install --mode artifacts --harness none
```

On Unix, `ryugi` is linked under `~/.local/bin` and its complete runtime is kept
under `$XDG_DATA_HOME/ryugi/install` (default `~/.local/share/ryugi/install`). Windows
uses a command shim. PATH instructions match your shell. Global npm/pnpm/Yarn/Bun
installations retain their original update channel; `--no-cli` keeps your existing
CLI while installing plugins.

`ryugi update` updates the CLI and recorded integrations, each in its current mode.
Use `--cli-only` or `--plugins-only` to select one part, and `--check` for a CLI
version check without writes. `ryugi doctor` checks files and native registration.
`ryugi uninstall` removes owned entries and retains project artifacts, comments,
plugin data and runtime caches. Modified files are preserved and reported.

Git is required for plugin downloads outside Claude's marketplace. Use
`--plugin-source /path/to/ryugi` with a checkout for offline or development installs.
`--install-dir` and `--bin-dir` customize the first install; the managed command
remembers its root. Re-run `install --mode artifacts|full --harness <targets>` to
change content. Existing Claude marketplace entries are recognized; other existing
Ryugi installations must first be removed with their original installer.

Each target keeps its native mechanism. Claude Code and Pi retain their comment
integrations; Codex retains its hooks, which you must trust in `/hooks`. Other
harnesses read comments on request. Installation success does not certify live
comment delivery. Start a new harness session after installation or a mode switch.
Other integrations below remain available through their manual installation paths.

In Full workflow mode, the bootstrap (`using-ryugi`) makes the skills fire on their
own. Open a clean session and send:

> Let's make a react todo list

A working Full install starts brainstorming before code is written. Artifacts mode
exposes the artifacts and interface-craft skills without the workflow bootstrap.

## Claude Code

```bash
/plugin marketplace add Innei/ryugi
/plugin install ryugi@ryugi-dev
```

In interactive sessions, Ryugi watches its document and Artboard comments
through Claude Code's plugin monitors. New comments reach the current
session without another terminal message; Claude reads them and applies
requested changes under the session's permissions. Open `/tasks` to find
**Ryugi document and Artboard comments** under **Monitors**, or stop it there.
The watch starts the first time a session loads `ryugi:artifacts`, so sessions
that never open an artifact run no watcher. It then lasts for the session and
also notices artifacts created later. A comment you resolve yourself does not
wake Claude.

This requires a Claude Code release with plugin monitors (tested on
2.1.314); monitors don't start with `claude -p`. Codex and Pi have their own
watches, described in their sections; other harnesses and older versions
read comments when asked. Claude's own hosted Artifacts keep their built-in
comment watches.

## Artifacts only

To get artboards, documents, HTML pages and comment delivery without the
workflow skills (brainstorming, specs, TDD, debugging, verifying,
worktrees), install the `ryugi-artifacts` entry instead of `ryugi`:

```bash
npx ryugi-artifacts install
```

Select Artifacts in the wizard, or pass `--mode artifacts --harness claude-code`.
Both content modes are available for every unified-installer target. To install by hand:

```text
/plugin install ryugi-artifacts --marketplace Innei/ryugi
```

The two entries share the plugin name `ryugi`, so enable only one of them.
The installer disables the other one at user scope and warns when a
project's `.claude/settings.json` or `.claude/settings.local.json` still
enables it. Switching later is the same command with the other mode.

For other supported harnesses, pass their target name to the unified installer;
manual installation commands below retain their existing full-workflow behavior.

## Antigravity

```bash
agy plugin install https://github.com/Innei/ryugi
```

Antigravity lists each installed skill's description, and the description of the
`using-ryugi` skill prompts the model to load that skill at the start of a
conversation. Reinstall with the same command to update.

## Codex, Cursor

The repository carries the manifests (`.codex-plugin/`,
`.agents/plugins/marketplace.json`, `.cursor-plugin/`), but Ryugi is not in
either official marketplace. Add this repository as a local plugin source
following your harness's plugin docs.

In Codex CLI, review and trust Ryugi's new hook definitions in `/hooks`
after installing or updating. The Codex hooks are separate from the Claude
Code bootstrap. They start a background comment watcher and stop it when
the session ends; repeated startup or compaction hooks share one watcher.
The background hook expires after 24 hours; the next user prompt restarts it.

The artifacts launcher registers each document or Artboard opened by the
current session. Only those artifacts can send review comments back to it;
opening the artifact library registers the project. Changes that have already
been resolved are skipped, including during a delivery retry.

### Codex desktop

For local desktop chats, the watcher uses the app-tools pipe and Node runtime
provided by Codex (`CODEX_APP_TOOLS_PIPE_PATH` and `CODEX_MCP_NODE_PATH`). It
sends artifact notifications through `send_message_to_thread` to the originating
hook session on the local host. This works when the desktop App Server uses
stdio and exposes no external `--listen` endpoint. No socket address, separate
server, or additional installation is needed. An explicit `RYUGI_CODEX_REMOTE`
or a host launched with `--listen` takes precedence and keeps the CLI route.

On macOS the watcher must itself run under the app-provided runtime: the desktop
checks the connecting process and its ancestry. The hook's Node must support
`process.execve` (Node 22.15 or newer) so the watcher can replace its runtime
before reading hook input, preserving its parent process and standard input.
An unsupported runtime is reported to the chat; permission checks are never
disabled. The stop hook does not require this runtime handoff.

Desktop delivery uses a private app interface and may need adaptation after
an app update. It requires the inherited pipe/runtime and the desktop's
`send_message_to_thread` tool. Remote and cloud chats are not supported by this
route. A desktop delivery error is retained for retry and never falls back to
an unrelated CLI daemon. Existing subscription, retry and cleanup behavior
is preserved; a lost acknowledgment can still produce a duplicate notification.

This path was exercised on macOS with desktop build 26.1027.51404 and bundled
Codex 0.166.0-alpha.5.1. Other desktop platforms are not live verified.

### Codex CLI

With an App Server endpoint, or without a desktop pipe, notifications continue
to use `codex queue --resume`, so they wake an idle session or wait behind its
current turn. They appear as queued user messages.

This requires a Codex CLI with `queue --resume` and background hooks
(tested on 0.166.0). A host launched with `--listen` supplies its endpoint
automatically on macOS and Linux. For another host, including Windows,
set `RYUGI_CODEX_REMOTE` to its `unix://`, `ws://`, or `wss://` endpoint in
the hook execution environment; `RYUGI_CODEX_REMOTE_AUTH_TOKEN_ENV` can
name an environment variable holding its authentication token. A stdio
host without a reachable endpoint cannot receive queue messages.

These lifecycle hooks apply to Codex; Cursor keeps its own integration.

## Devin CLI

```bash
devin plugins install Innei/ryugi
devin plugins update ryugi # update later
```

## Factory Droid

```bash
droid plugin marketplace add https://github.com/Innei/ryugi
droid plugin install ryugi@ryugi
```

## Gemini CLI

```bash
gemini extensions install https://github.com/Innei/ryugi
gemini extensions update ryugi # update later
```

## Kimi Code

```text
/plugins install https://github.com/Innei/ryugi
```

Full guide: [README.kimi.md](README.kimi.md).

## OpenCode

OpenCode uses its own plugin install; install Ryugi separately even if you
already use it in another harness.

```text
Fetch and follow instructions from https://raw.githubusercontent.com/Innei/ryugi/refs/heads/main/.opencode/INSTALL.md
```

Full guide: [README.opencode.md](README.opencode.md).

## Pi

```bash
pi install git:github.com/Innei/ryugi
```

For local development, run Pi with a checkout loaded as a temporary package:

```bash
pi -e /path/to/ryugi
```

The Pi package loads the Ryugi skills and a small extension that injects the
`using-ryugi` bootstrap at session startup and again after compaction. Pi has
native skills, so no compatibility `Skill` tool is required. Subagent and
task-list tools remain optional Pi companion packages.

The extension also watches review comments. The artifacts launcher records
each document or Artboard the session opens, keyed by Pi's session ID; a
human comment or a submitted choice round on one of them reaches that
session as a custom message. An idle session starts a turn; a busy one
gets it after its current turn, without interrupting a running tool. The
watch follows the session through `/reload`, stops when the session ends,
and a delivery failure shows a warning instead of stopping Pi. Tested on
Pi 1.4.0.

Known limits:

- A Pi started inside a Codex or Claude Code session inherits their session
  variable, so the launcher registers the artifact with the outer host and
  Pi is not woken.
- Only artifacts in the session's own project are watched; opening one with
  `--project-dir` pointing elsewhere registers it there, where this session
  does not look.
- `/fork` and `/new` start a session that watches nothing until it opens an
  artifact itself; unread comments then arrive at once.
- A choice round submitted while no session watched it is not replayed;
  comments are, until read.
- The watch records a round's new state before delivering the event, so a
  choice event whose delivery fails is not sent again.
- A failure warning is shown once per distinct message and is not reset when
  deliveries recover, so the same error later in the session shows no new
  warning.
- All Pi sessions in a project share one read position, so a session that
  lists the comments marks them read for the others.
- The viewer's "terminal is listening" hint stays off for Pi.
- A session's list of opened artifacts only grows.

## Qwen Code

Qwen Code installs plugins from Claude Code marketplaces directly. Pick `ryugi`
when prompted.

```bash
qwen extensions install Innei/ryugi
qwen extensions update ryugi # update later
```

## Hermes Agent

```bash
hermes plugins install Innei/ryugi --enable
```

Restart any active Hermes sessions after installing. Hermes has no
post-compaction hook, so a very long session that compacts over its first turn
loses the bootstrap — start a fresh session if skills stop triggering.

## Muse

```bash
muse plugins install ./
muse plugins approve ryugi
muse plugins update ryugi # update later
```

`muse plugins install ./ryugi` after a clone works the same way. Restart any
active Muse sessions so the `SessionStart` hook takes effect — skills are active
immediately, hooks require approval on first install. Version is tracked in
`.version-bump.json` so `scripts/bump-version.sh` keeps it in sync.

## Writing a new integration

See [porting-to-a-new-harness.md](porting-to-a-new-harness.md).
