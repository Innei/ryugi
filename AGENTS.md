# Ryugi — Project Guidelines

Ryugi is a fork of [Superpowers](https://github.com/obra/superpowers), reshaped around one workflow: brainstorm with mockups on the Artboard, approve a spec, build it inline under TDD. Read `README.md` for the workflow before changing anything.

## Skills Are Code

Skill files shape agent behavior; treat edits to them like code changes.

- Use the repo-local `writing-skills` skill (`.claude/skills/writing-skills/`) to develop and test changes.
- Run a baseline without the change and a run with it, and keep the before/after results with the change.
- Do not rewrite carefully-tuned content (Red Flags tables, rationalization lists) without evidence the change is an improvement.
- "Your human partner" is deliberate wording, not interchangeable with "the user".

## Zero Dependencies

The plugin ships without runtime dependencies. The Artboard is built from `artboard/` (React, Vite) into a prebuilt bundle under `skills/brainstorming/artboard/`; the bundle needs only Node built-ins at runtime. Rebuild it with `cd artboard && pnpm build` after changing its source.

## Harness Integrations

A real integration loads the `using-ryugi` bootstrap at session start. The acceptance test: open a clean session in the harness and send exactly

> Let's make a react todo list

A working integration auto-triggers `brainstorming` before any code is written. Copying skill files by hand, runtime shims, and per-session opt-ins are not integrations.

## Tests

- Plugin-infrastructure tests live in `tests/`; run the relevant `run-*.sh` or test script for what you changed.
- Artboard tests: `cd artboard && pnpm test`.
- `docs/testing.md` lists what each suite covers.

## Pull Requests

- One problem per PR, against `main`.
- Fill in every section of `.github/PULL_REQUEST_TEMPLATE.md`.
- Disclose the model, harness, and plugins that produced the change, or state that it was written by hand.
