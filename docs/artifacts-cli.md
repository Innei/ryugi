# Artifacts CLI

Open a project's saved artboards, documents and HTML pages without starting an agent session:

```bash
npx ryugi-artifacts
npx ryugi-artifacts /path/to/project
npx ryugi-artifacts --no-open
```

The local library shows content previews, type filters and title/id search across every registered project. Sort by newest update, oldest update or name. Previews load as their cards come into view; opening a card takes you to the full artifact. The server reads `.ryugi/artifacts/` in each registered project and keeps the library in sync with file changes.

The command reuses the machine's running server. Agent calls to `start --artifact …` return links without activating a browser tab when reusing a server; `--open` explicitly opens or focuses that artifact. Run from a subdirectory of a git repository, it uses the repository root's `.ryugi/artifacts/`, unless a directory between them already has its own. A new server stays in the terminal; Ctrl+C stops it and keeps your artifacts. Node.js is required.

The first successful server start while signed out recommends signing in to Ryugi Cloud for sharing and reviewing artifacts from other devices. Sign-in is optional and local work continues immediately. Run `npx ryugi-artifacts publish --login` in that project to get the sign-in URL. The recommendation appears once across projects on this machine, remembered as `login-hint-shown` beside the cloud credentials in the Ryugi configuration directory. Already signed-in accounts, help and version queries, and failed starts do not show it. With `start --json`, the same response includes `loginHint` with `message`, `command`, `projectDir`, and an `agentInstruction` asking the agent to relay the recommendation without waiting for sign-in; stdout remains one JSON line.

Browser links use a stable random ID, such as `/document/<id>` or `/artboard/<id>?page=review`. The ID is 21 letters and digits, without `_` or `-`; IDs written by earlier releases are 32 hex characters (or carry `_`/`-`) and keep working. Files and CLI locators keep their readable slugs (`document/design-notes`). Each artifact stores its browser ID in `.artifact-id` inside its directory; keep that file when renaming or moving the directory within its type. Existing slug links still open and switch to the ID address. When duplicating an artifact as new work, omit `.artifact-id` from the copy so it receives its own ID; conflicting IDs are reported instead of choosing one copy.

Artboard page links restore the selected page on refresh and support browser back and forward. Page changes also carry into cloud share links. Agent updates preserve an open viewer's page, camera and comment draft; `activePage` and `focus` supply opening defaults. If the current page is deleted, the viewer falls back to an existing page.

## One server for the machine

One server serves every project on this machine and stays up until you stop it. It listens on the first free port of 27319, 27320 and 27321, and serves artboard boards from 27329, 27330 or 27331; `--port` picks another one, and `RYUGI_ARTIFACTS_PORTS` / `RYUGI_ARTIFACTS_BOARD_PORTS` replace the lists. `start` in a project registers that project with the server, starting the server first when none runs. Artifacts stay in each project's `.ryugi/artifacts/`.

The home page (the server's `url`) lists the artifacts of every registered project, newest first under "Recent · all projects", or one project at a time from the sidebar. Dormant projects (unused for 7 days) are folded; right-click a project to remove it from the list (its files stay). The search box searches this project or all projects, and ⌘K opens a palette grouped by project: ↵ opens, ⌘↵ opens in a new tab.

The status pill in the top bar shows the version, the cloud relay and an "Update" badge when npm has a newer release (checked once a day). Its panel shows uptime, address, relay, live pages and the registered projects, and has upgrade-and-restart, restart, stop and the server log, filterable by project.

`npx ryugi-artifacts stop` stops the server for every project; `--project-dir` is accepted and ignored. A `start` with a newer release replaces the running server on the same port; an older release reuses it and prints a hint. Server-wide options (`--host`, `--url-host`, `--port`, `RYUGI_CLOUD_ORIGIN`) that differ from the running server's replace it too.

The server keeps its state in `~/.ryugi/server/` (`RYUGI_SERVER_HOME` moves it): `projects.json`, the key, the log and `server-info`. Each registered project also gets `.ryugi/artifacts/.state/server-info` pointing at it. The first `start` of this release stops per-project servers from earlier releases; reload their open tabs once, because the port changes.

The same CLI runs what the skill uses: `npx ryugi-artifacts start`, `stop` and `publish` (`<command> --help` lists a command's options; add `--json` for one JSON line). `npx ryugi-artifacts get <link>` reads a published Ryugi Cloud artifact with this machine's cloud sign-in and prints its source (a document's LiteXML and comments) even when piped; only `--json` makes it print JSON. A local build of `ryugi-artifacts` can write gitignored copies to `skills/artifacts/app/`; the skill's launcher prefers a local `cli.cjs` over the npm release.

Run directly from a terminal, the CLI prints a line on stderr when a newer release is out. It reads the version from `~/.cache/ryugi/artifacts/latest.json`, the launcher's cache, and refreshes that file at most once a day in a detached process, so no command waits on npm. It stays quiet under the skill's launcher, with `--json`, outside a terminal, in CI, and with `NO_UPDATE_NOTIFIER` set. `ryugi-artifacts update` installs the newest release with the package manager that installed this one (npm, pnpm, yarn or bun, detected from the install path; `--pm` overrides it, `--check` only compares). For an npx, pnpm dlx or bunx run, a local build, or the launcher, it says how to update instead.

Cloud publish failures keep the cloud HTTP status in `publish --json` output. When provided, `code`, `plan`, and `limit` (`kind`, `used`, `max`, and `requested`) are preserved. Account quota failures remain `type: "plan-limit"` with exit code 2; artifact storage exhaustion uses `code: "artifact_storage_limit"`, status 413 and exit code 1. Auto-publish reports the same exhaustion reason immediately.

## License

Ryugi's skills, harness integrations and docs are MIT. `ryugi-artifacts` is proprietary and not part of this repository; releases up to 1.51.2 were published under AGPL-3.0-only.
