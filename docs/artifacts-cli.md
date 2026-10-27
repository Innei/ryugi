# Artifacts CLI

Open a project's saved artboards, documents and HTML pages without starting an agent session:

```bash
npx ryugi-artifacts
npx ryugi-artifacts /path/to/project
npx ryugi-artifacts --no-open
```

The local library shows content previews, type filters and title/id search. Sort by newest update, oldest update or name. Previews load as their cards come into view; opening a card takes you to the full artifact. The server reads `.ryugi/artifacts/` in the selected project and keeps the library in sync with file changes.

The command reuses a running project server. Run from a subdirectory of a git repository, it uses the repository root's `.ryugi/artifacts/`, unless a directory between them already has its own. A new server stays in the terminal; Ctrl+C stops it and keeps your artifacts. Node.js is required.

Browser links use a stable random ID, such as `/document/<id>` or `/artboard/<id>?page=review`. The ID is 21 letters and digits, without `_` or `-`; IDs written by earlier releases are 32 hex characters (or carry `_`/`-`) and keep working. Files and CLI locators keep their readable slugs (`document/design-notes`). Each artifact stores its browser ID in `.artifact-id` inside its directory; keep that file when renaming or moving the directory within its type. Existing slug links still open and switch to the ID address. When duplicating an artifact as new work, omit `.artifact-id` from the copy so it receives its own ID; conflicting IDs are reported instead of choosing one copy.

Artboard page links restore the selected page on refresh and support browser back and forward. Page changes also carry into cloud share links.

## See and stop running servers

Agents start servers in the background, one per project. To see them all:

```bash
npx ryugi-artifacts monitor
```

In a terminal it opens a live view that refreshes every 2 seconds: project, port, pid, uptime, open browser tabs, time since last use and release. A server with no open tab and 30 minutes without use is tagged `safe to stop`. Keys: `↑`/`↓` (or `j`/`k`) select, `o` opens it in the browser, `c` copies its URL, `l` follows its log, `x` stops it, `X` stops every server that is safe to stop (both ask for `y` first), `q` quits. Outside a terminal, or with `--json`, it prints the list once.

Each server lists itself in `/tmp/ryugi-<uid>/servers/` (`<temp>\ryugi\servers\` on Windows) while it runs; `RYUGI_RUNTIME_DIR` moves it. Servers from releases before 1.33.0 don't list themselves.

The same CLI runs what the skill uses: `npx ryugi-artifacts start`, `stop` and `publish` (`<command> --help` lists a command's options; add `--json` for one JSON line). `npx ryugi-artifacts get <link>` reads a published Ryugi Cloud artifact with this machine's cloud sign-in and prints its source (a document's LiteXML and comments) even when piped; only `--json` makes it print JSON. For development, run `cd artifacts && pnpm build`, then `node artifacts/bin/ryugi-artifacts.cjs /path/to/project` from the repository root.

Run directly from a terminal, the CLI prints a line on stderr when a newer release is out. It reads the version from `~/.cache/ryugi/artifacts/latest.json`, the launcher's cache, and refreshes that file at most once a day in a detached process, so no command waits on npm. It stays quiet under the skill's launcher, with `--json`, outside a terminal, in CI, and with `NO_UPDATE_NOTIFIER` set. `ryugi-artifacts update` installs the newest release with the package manager that installed this one (npm, pnpm, yarn or bun, detected from the install path; `--pm` overrides it, `--check` only compares). For an npx, pnpm dlx or bunx run, a local build, or the launcher, it says how to update instead.

Cloud publish failures keep the cloud HTTP status in `publish --json` output. When provided, `code`, `plan`, and `limit` (`kind`, `used`, `max`, and `requested`) are preserved. Account quota failures remain `type: "plan-limit"` with exit code 2; artifact storage exhaustion uses `code: "artifact_storage_limit"`, status 413 and exit code 1. Auto-publish reports the same exhaustion reason immediately.

## License

`ryugi-artifacts` is AGPL-3.0-only — [artifacts/LICENSE](../artifacts/LICENSE) — while Ryugi's skills and harness integrations are MIT. A modified version served to other people over a network must offer them its source.

