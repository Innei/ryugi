# Ryugi — Project Guidelines

Ryugi is a fork of [Superpowers](https://github.com/obra/superpowers), reshaped around one workflow: brainstorm with mockups on the Artboard, approve a spec, build it inline under TDD. Read `README.md` for the workflow before changing anything. `UPSTREAM.md` records the upstream baseline (superpowers v7.0.0) and how to port upstream changes.

## Skills Are Code

Skill files shape agent behavior; treat edits to them like code changes.

- Use the repo-local `writing-skills` skill (`.claude/skills/writing-skills/`) to develop and test changes.
- Run a baseline without the change and a run with it, and keep the before/after results with the change.
- Do not rewrite carefully-tuned content (Red Flags tables, rationalization lists) without evidence the change is an improvement.
- "Your human partner" is deliberate wording, not interchangeable with "the user".

## Zero Dependencies

The plugin ships without runtime dependencies. The artifacts app (artboard, document and HTML artifacts) is developed outside this repository and published to npm as `ryugi-artifacts`: the `ryugi-artifacts` CLI (`dist/cli.cjs`: `start`, `stop`, `publish`), the server (`dist/server.cjs`, one file with its dependencies bundled, including Loro and haklex) and the viewer it serves (`dist/viewer/`). Neither is committed, and the package declares no runtime dependencies.

- **Users**: the skill runs every command through `skills/artifacts/app/ryugi-artifacts.cjs`, a small launcher that runs the newest `ryugi-artifacts` release (1.43.0 or newer; older releases have no `get` command). It asks npm for the latest version at most once a day, installs each version once into `~/.cache/ryugi/artifacts/<version>/`, and offline runs the newest version already installed. A running server from an older release is replaced on the same port and key. The server may have npm dependencies.
- **Development**: a local build of `ryugi-artifacts` can write gitignored copies to `skills/artifacts/app/cli.cjs`, `server.cjs` and `viewer/`. The launcher prefers a local `cli.cjs` over the npm release; delete those copies to run the npm release again.

## Releasing

Users install from `main`. `ryugi-artifacts` releases separately on npm; a plugin release only versions the skills and harness manifests.

1. `scripts/bump-version.sh <version>` and commit.
2. `git tag v<version>` and `git push --atomic origin main v<version>`.
3. The `Release` workflow checks the versions and creates the GitHub Release.

## Harness Integrations

A real integration loads the `using-ryugi` bootstrap at session start. The acceptance test: open a clean session in the harness and send exactly

> Let's make a react todo list

A working integration auto-triggers `brainstorming` before any code is written. Copying skill files by hand, runtime shims, and per-session opt-ins are not integrations.

## Licensing

Skills, harness integrations and docs are under Ryugi License 1.0 (`LICENSE`): use, modification and redistribution are permitted; the Restricted Parties in Schedule A (major Chinese platform companies and their agent and IDE products) receive no rights, and scraping the skills into a marketplace is prohibited. Upstream Superpowers material and contributions made before 2026-11-04 remain MIT — see Exhibit B, and keep it intact when editing `LICENSE`. The `ryugi-artifacts` package the launcher installs is proprietary (npm `license`: `UNLICENSED`) and is not part of this repository.

## Tests

- Plugin-infrastructure tests live in `tests/`; run the relevant `run-*.sh` or test script for what you changed.
- `docs/testing.md` lists what each suite covers.
