# Installing Ryugi

Ryugi is not listed in any harness's official marketplace; install it from this
repository. If you use more than one harness, install it in each.

The bootstrap (`using-ryugi`) is what makes the skills fire on their own. The
acceptance test is the same everywhere: open a clean session and send

> Let's make a react todo list

A working install triggers `brainstorming` before any code is written.

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
opening the artifact library registers the project. Notifications use
`codex queue --resume`, so they wake an idle session or wait behind its
current turn. They appear as queued user messages. Changes that have
already been resolved are skipped, including during a delivery retry.

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
