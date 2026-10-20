# Artifacts CLI Consolidation

Agreed with the human partner on 2026-10-20 in the document artifact
`.ryugi/artifacts/document/cli-consolidation/` and in chat: they resolved the
option A thread, said "删" to the shims, said the server lifecycle is fine as
it is, and approved building it as written.

## Why

The artifacts tooling is scattered: `skills/artifacts/app/start-server.sh`
(359 lines of bash with five embedded `node -e` programs), `stop-server.sh`
and `publish.sh` live in the skill, while people use `npx ryugi-artifacts`,
which only spawns `start-server.sh --foreground`. The human partner wants
all of it behind one CLI, so the skill no longer maintains publish or stop
logic, and so the CLI can later be rewritten in Go or Rust without touching
the skill.

## Goals

- One CLI, `ryugi-artifacts`, with subcommands for what exists today:
  `start`, `stop`, `publish` (all of its actions), plus `--version`/`-v`
  (already implemented, unreleased).
- The skill calls only that CLI, through a small launcher. The CLI's
  subcommands, flags, exit codes and JSON output are the only contract the
  skill depends on; the implementation language can change later without
  changing the skill or the launcher.
- Agents get the same one-line JSON they get today, with the same fields
  (`type`, `url`, `port`, `root`, `link`, `reused`, `error`, publish
  results, `login-required` with exit code 2).
- The newest-release behavior stays: ask npm at most once a day, install each
  version once into `~/.cache/ryugi/artifacts/<version>/`, fall back to the
  newest installed version offline, retry npm after an hour on failure, and
  replace a running server from an older release on the same port and key.
- No Bash required anywhere in the artifacts flow. A side benefit is that
  Windows should work without Git Bash; this is not verified (CI is Ubuntu
  only) and no Windows CI is added (my call).
- The plugin keeps zero runtime dependencies.

## Non-goals

- New capabilities. No `status` command; it was proposed and dropped.
- Server lifecycle changes. The 4-hour idle timeout, stop-when-all-owners-exit,
  and "re-run start before giving a link" stay as they are; the human partner
  confirmed this is fine.
- Server or cloud API changes.
- The plugin's other hooks (`hooks/run-hook.cmd` etc.).

## Anti-goals

- Agent calls slower than today, for example waiting on npm on every call.
- Offline starts breaking.
- The CLI or launcher calling `bash`.

## Decided

### Launcher (option A)

The skill keeps one small Node script (my call on the name:
`skills/artifacts/app/ryugi-artifacts.cjs`), run as
`node app/ryugi-artifacts.cjs <subcommand> ...`. It:

1. prefers a local development build (today `start-server.sh` prefers a
   local `server.cjs`; the build must now also place the CLI there);
2. otherwise resolves the newest release with today's rules (above) and
   installs it if needed (staging directory renamed into place, so concurrent
   starts don't clobber each other);
3. passes the subcommand and arguments unchanged to that release's CLI, and
   passes through its stdout, stderr and exit code;
4. tells the CLI which process owns this session (today: the parent of the
   throwaway shell the harness spawned, i.e. the parent of the launcher's
   parent).

The version-resolution and install logic moves from bash into this script
as plain JS. Everything else (argument parsing, locking, already-running
detection, old-release replacement, owner registration, backgrounding,
info JSON, stop, publish) moves into the CLI.

Options considered and rejected: calling `npx -y ryugi-artifacts@latest`
from the skill (an npm round trip of 1–3 s on every call, and offline
failure), and requiring a global install (manual upgrades, against
"always run the newest release").

### Minimum CLI version

The skill ships from `main`; the CLI ships from npm, and npm can take
15 minutes or more to serve a new version (observed for 1.8.0 today). The
launcher therefore requires a minimum CLI version, the first release with
subcommands. If the resolved release is older, it asks npm again regardless
of the daily cache. If npm still has nothing new enough, it fails with a
JSON `error` saying the required version is not on npm yet and to retry in
a few minutes. It never runs an older CLI with arguments that CLI does not
understand.

### Replacing a running server

Keep today's semantics exactly (my call). A start through the launcher
replaces a running server whose recorded version differs from the resolved
release in either direction, on the same port and key, which is what
AGENTS.md's rollback via `npm dist-tag` relies on. A CLI not started by the
launcher (`npx`, a global install, a development build) records no version
and always reuses a running server, as `npx ryugi-artifacts` does today.
The launcher tells the CLI it is the managed release. Rolling `latest` back
below the minimum CLI version is not supported; AGENTS.md's rollback note
says so.

### CLI shape

```
ryugi-artifacts                     # no subcommand: today's behavior, foreground start + open the browser
ryugi-artifacts start   [--project-dir P] [--artifact type/id] [--host H] [--url-host H]
                        [--idle-timeout-minutes N] [--open|--no-open] [--foreground|--background]
ryugi-artifacts stop    [--project-dir P]
ryugi-artifacts publish --artifact type/id [--public|--private] [--unpublish]
ryugi-artifacts publish --list | --delete ID | --login | --logout   [--project-dir P]
ryugi-artifacts --version | -v
ryugi-artifacts --help | -h
```

Flags keep their current names and meanings from the three scripts.
Background versus foreground keeps today's rule: foreground under `CODEX_CI`
and on Windows unless `--background` is given (builder may revisit Windows
if a detached Node child is proven to survive there).

Output (my call): one JSON line when stdout is not a TTY (every agent shell)
or with `--json`; readable text in a terminal. Exit codes as today: 0 done,
1 error, 2 sign-in needed.

### Migration

- Delete `start-server.sh`, `stop-server.sh` and `publish.sh` in this change.
  No forwarding shims (the human partner's call).
- Update every reference: `skills/artifacts/SKILL.md`, `AGENTS.md`,
  `.gitignore` comment, `scripts/check-viewer-release.sh` comment,
  `docs/porting-to-a-new-harness.md`, `artifacts/package.json` (`files`
  drops `dist/start-server.sh`; the `build:server` script stops copying it).
  Older specs under `docs/ryugi/specs/` are history and stay unchanged.
- Also update `README.md` (it says Bash is required) and `test/package.test.ts`.
- The skill always passes `--json`, since some harnesses run commands in a
  pseudo-terminal (my call).
- Keep `dist/server.cjs` and the state files' format stable, so older plugin
  copies keep working against new releases.
- Port the behavior tests in `artifacts/test/scripts.test.ts` (25) and
  `artifacts/test/publish-script.test.ts` (8) to the CLI and the launcher;
  keep `test/cli.test.ts` and `test/package.test.ts` passing.
- Skill edits follow the repo's `writing-skills` process (baseline and a run
  with the change).
- Ships as a release (version bump, minor), together with the unreleased
  `--version` flag.

## Constraints

- Node 18+ (the server already targets `node18`).
- The launcher and the CLI use only Node built-ins.
- State files keep owner-only permissions (today `umask 077`).

## Left to the builder

- Where the CLI source lives and how it is built (a bundled `dist/cli.cjs`
  behind `bin/ryugi-artifacts.cjs`, or similar).
- How the launcher hands the owner pid to the CLI (flag or environment
  variable), as long as it is not part of the human-facing help.
- The readable text format for terminal output.
- Exact error wording.
