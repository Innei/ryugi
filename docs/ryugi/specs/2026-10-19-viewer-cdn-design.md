# Viewer on CDN: design

Date: 2026-10-19
Status: approved

## Intent

The artifacts viewer (React app behind Artboard and HTML artifacts) is built
into `skills/artifacts/app/viewer/` and committed. Every rebuild adds about
1 MB of hashed JS and CSS to Git history that never goes away, so the repo
only grows. Four bundle commits in, the viewer blobs already total about
3 MB uncompressed (the whole packed repo is 836 KiB today).

The human partner wants the viewer built in GitHub CI and served from a CDN,
so the repo holds source only, and wants the bundles already committed
removed from history.

## Goals

- Viewer JS and CSS are no longer committed; CI builds and publishes them.
- Users load the viewer from jsDelivr, served from an npm package.
- Version locking: plugin version X always loads viewer X. Published
  versions are immutable.
- A tag-driven release: pushing `vX.Y.Z` publishes viewer X.Y.Z.
- Existing viewer bundles are purged from Git history.

## Non-goals

- Offline use and CDN failure handling. If jsDelivr is unreachable, the
  viewer does not load; no fallback, no error UI, no report to the agent.
- Moving `server.cjs` to the CDN. It runs in local Node and stays committed
  (42 KB, changes rarely).
- Closing the gap between the tag landing on `main` and npm publish finishing
  (about 2 minutes, longer if CI fails). Users installing in that window get
  a 404 for the viewer; accepted.
- A release branch or publish-before-merge flow.

## Anti-goals

- Any runtime dependency for users. The server stays Node built-ins only.
- A plugin version loading a viewer from a different version (no `@latest`,
  no ranges).

## Current state

- `artifacts/` (React, Vite, StyleX) builds two things:
  - `build:server`: esbuild → `skills/artifacts/app/server.cjs`
  - `build:viewer`: Vite → `skills/artifacts/app/viewer/` (`index.html`,
    `assets/index-<hash>.js` 774 KB, `assets/index-<hash>.css` 296 KB)
- `artifacts/src/server/main.ts` passes `viewerDir: <__dirname>/viewer`.
  `app.ts` serves `viewer/index.html` for shell routes and static files from
  `viewerDir`, all under `VIEWER_CSP` (`script-src 'self'`,
  `style-src 'self' 'unsafe-inline'`, `font-src 'self' data:`).
- `scripts/bump-version.sh` syncs the version across the 12 files listed in
  `.version-bump.json`; `--check` reports drift. Current version 7.0.0. No
  Git tags exist. No `.github/workflows/` exists.
- `scripts/package-codex-plugin.sh` ships only `skills/` (plus metadata), so
  anything the server needs at runtime must live under `skills/`.
- The npm name `ryugi-artifacts` is free.

## Decided

### Distribution

- npm package `ryugi-artifacts` (the existing `artifacts/package.json`,
  made publishable), containing the built viewer. Loaded via
  `https://cdn.jsdelivr.net/npm/ryugi-artifacts@<exact version>/...`.
- Viewer output uses fixed file names (`index.js`, `index.css`), no content
  hash; the version in the URL is the cache key.

### Shell HTML

- `viewer/index.html` is no longer committed. The server generates the shell
  HTML at runtime with `<script type="module" crossorigin>` and
  `<link rel="stylesheet" crossorigin>` pointing at the jsDelivr URLs for its
  version. Keep the existing head (`charset`, `viewport`,
  `referrer no-referrer`, title `Artifacts`) and `<div id="root">`.
- The version comes from a file under `skills/artifacts/app/` (e.g.
  `version.json`), added to `.version-bump.json` so `bump-version.sh` keeps
  it in sync. Bumping the version must not require rebuilding `server.cjs`.
- `VIEWER_CSP` allows `https://cdn.jsdelivr.net` for scripts and styles
  (and fonts, if the viewer bundle loads any from its own package).
- Local development: if `skills/artifacts/app/viewer/` exists (a local
  build, gitignored), the server serves it as today instead of the CDN.

### Release

1. `scripts/bump-version.sh X.Y.Z` (now also bumping
   `artifacts/package.json` and the version file above), commit.
2. `git tag vX.Y.Z`, push `main` and the tag.
3. GitHub Actions on `v*` tags:
   - `bump-version.sh --check` and fail if any version differs from the tag
   - install, test, build the viewer
   - `npm publish` with provenance
   - create a GitHub Release for the tag

### Unreleased changes on main

- Users install from `main` HEAD, and `server.cjs` is committed per change
  while the viewer only moves at a release. A viewer or server–viewer
  contract change on `main` without a release would pair a new server with
  an old viewer.
- Rule: any change under `artifacts/src/` ships with a version bump. A CI
  check on pushes and PRs to `main` fails when `artifacts/src/` differs from
  the latest `v*` tag and the version still equals that tag. Each such
  change therefore goes out as a release, with the publish gap above.

### History purge

- Goal: fresh clones carry no viewer bundles. Removing the objects from
  GitHub's servers is out of scope: open PR #1 (Renovate) pins old history
  through `refs/pull/1/head`, which only GitHub Support can clear.
- Done when a fresh `git clone` has no blob under any `viewer/assets/` path.
- Before rewriting, the working tree must be clean. At design time it held
  uncommitted work outside this spec (CORS header in
  `artifacts/src/server/app.ts`, start lock in
  `skills/artifacts/app/start-server.sh`, tests in
  `artifacts/test/scripts.test.ts` and `server.test.ts`); it is committed as
  its own commit first, after the human partner confirms, so it is rewritten
  along with the rest.
- Rewrite all history with `git filter-repo`, removing built viewer output
  from every path it has lived at: `skills/artifacts/app/viewer/` and the
  earlier `skills/brainstorming/artboard/viewer/`. Keep `server.cjs`.
- Force-push `main`. Delete the remote `renovate/configure` branch (built on
  old history) so Renovate recreates it.
- The repo is one day old; existing marketplace installs may fail to update
  and need a reinstall. Accepted.
- The force-push is irreversible; confirm with the human partner immediately
  before running it.

### Docs

- `AGENTS.md` "Zero Dependencies" section: replace the "prebuilt bundle"
  description with the new split (server committed, viewer from CDN, local
  build for development) and point to the release steps.
- `docs/testing.md`: add whatever new test coverage lands.

## Left to the builder

- Package layout: where Vite writes the viewer for publishing (npm cannot
  include files outside `artifacts/`) versus the gitignored local
  `skills/artifacts/app/viewer/` for development, and the `files` field.
- Name and shape of the version file; how `main.ts` reads it.
- Whether the shell HTML is a template string in the server or a small
  template file.
- npm auth in CI (token secret vs trusted publishing) and workflow details.
- Ordering of the history purge relative to the code change (purge first is
  simpler since nothing new is committed under `viewer/` afterwards).
- Tests: server serves CDN shell vs local viewer; CSP includes jsDelivr;
  version file stays in sync via `bump-version.sh --check`.
