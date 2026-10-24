# Artifacts CLI

Open a project's saved artboards, documents and HTML pages without starting an agent session:

```bash
npx ryugi-artifacts
npx ryugi-artifacts /path/to/project
npx ryugi-artifacts --no-open
```

The local library shows content previews, type filters and title/id search. Sort by newest update, oldest update or name. Previews load as their cards come into view; opening a card takes you to the full artifact. The server reads `.ryugi/artifacts/` in the selected project and keeps the library in sync with file changes.

The command reuses a running project server. A new server stays in the terminal; Ctrl+C stops it and keeps your artifacts. Node.js is required.

Browser links use a stable random ID, such as `/document/<id>` or `/artboard/<id>?page=review`. Files and CLI locators keep their readable slugs (`document/design-notes`). Each artifact stores its browser ID in `.artifact-id` inside its directory; keep that file when renaming or moving the directory within its type. Existing slug links still open and switch to the ID address. When duplicating an artifact as new work, omit `.artifact-id` from the copy so it receives its own ID; conflicting IDs are reported instead of choosing one copy.

Artboard page links restore the selected page on refresh and support browser back and forward. Page changes also carry into cloud share links.

The same CLI runs what the skill uses: `npx ryugi-artifacts start`, `stop` and `publish` (`--help` lists their options; add `--json` for one JSON line). For development, run `cd artifacts && pnpm build`, then `node artifacts/bin/ryugi-artifacts.cjs /path/to/project` from the repository root.

Cloud publish failures keep the cloud HTTP status in `publish --json` output. When provided, `code`, `plan`, and `limit` (`kind`, `used`, `max`, and `requested`) are preserved. Account quota failures remain `type: "plan-limit"` with exit code 2; artifact storage exhaustion uses `code: "artifact_storage_limit"`, status 413 and exit code 1. Auto-publish reports the same exhaustion reason immediately.

