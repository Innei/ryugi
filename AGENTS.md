# Ryugi — Project Guidelines

Ryugi is a fork of [Superpowers](https://github.com/obra/superpowers), reshaped around one workflow: brainstorm with mockups on the Artboard, approve a spec, build it inline under TDD. Read `README.md` for the workflow before changing anything. `UPSTREAM.md` records the upstream baseline (superpowers v7.0.0) and how to port upstream changes.

## Skills Are Code

Skill files shape agent behavior; treat edits to them like code changes.

- Use the repo-local `writing-skills` skill (`.claude/skills/writing-skills/`) to develop and test changes.
- Run a baseline without the change and a run with it, and keep the before/after results with the change.
- Do not rewrite carefully-tuned content (Red Flags tables, rationalization lists) without evidence the change is an improvement.
- "Your human partner" is deliberate wording, not interchangeable with "the user".

## Zero Dependencies

The plugin ships without runtime dependencies. The artifacts app (Artboard and HTML artifacts) is built from `artifacts/` (React, Vite) in two parts:

- **Server**: `skills/artifacts/app/server.cjs`, committed, Node built-ins only. Rebuild it with `cd artifacts && pnpm build:server` after changing server source.
- **Viewer**: never committed. Users load it from `cdn.jsdelivr.net/npm/ryugi-artifacts@<version>/`, pinned to `skills/artifacts/app/version.json`. `pnpm build:viewer` writes a gitignored local copy to `skills/artifacts/app/viewer/`, which the server prefers over the CDN while you develop.

## Releasing

Users install from `main`, so any change under `artifacts/src/` ships as a release. CI fails a PR that changes it since the last tag without a version bump, and fails `main` whenever its version has no tag.

1. `scripts/bump-version.sh <version>` and commit.
2. `git tag v<version>` and `git push --atomic origin main v<version>`.
3. The `Release` workflow checks the versions, tests, publishes `ryugi-artifacts` to npm and creates the GitHub Release. Until it finishes, new installs cannot load the viewer.

## Harness Integrations

A real integration loads the `using-ryugi` bootstrap at session start. The acceptance test: open a clean session in the harness and send exactly

> Let's make a react todo list

A working integration auto-triggers `brainstorming` before any code is written. Copying skill files by hand, runtime shims, and per-session opt-ins are not integrations.

## Tests

- Plugin-infrastructure tests live in `tests/`; run the relevant `run-*.sh` or test script for what you changed.
- Artifacts app tests: `cd artifacts && pnpm test`.
- `docs/testing.md` lists what each suite covers.

## Pull Requests

- One problem per PR, against `main`.
- Fill in every section of `.github/PULL_REQUEST_TEMPLATE.md`.
- Disclose the model, harness, and plugins that produced the change, or state that it was written by hand.
