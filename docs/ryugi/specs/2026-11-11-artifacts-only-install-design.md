# Artifacts-only install: one repository, a mode chosen at install time

Status: approved · 2026-11-11
Discussed in `document/artifacts-standalone`.

## Intent

The full workflow (brainstorm → spec → TDD) is hard to promote: it is
abstract and overlaps with Superpowers. Artifacts can be shown in seconds:
the agent opens an artboard of directions, you comment, the comment comes
back to the agent. The artifacts app is already its own project
(`ryugi-cloud/packages/artifacts`, published as `ryugi-artifacts`, with a
`landing/` page). So nothing moves and no repository is created. An install
entry lets people pick "artifacts only" and get no workflow.

## Goals

- One command from the landing page installs Artifacts. The session lists
  only `ryugi:artifacts` and `ryugi:interface-craft`; no brainstorming
  bootstrap, no spec first.
- Wanting the full workflow later: run install again and pick full. No
  uninstall needed.
- Existing users do nothing; `ryugi@ryugi-dev` behaves exactly as today.

## Non-goals

- No repository split, no skill file edits, no server, viewer or Cloud
  changes.
- Harnesses other than Claude Code get no artifacts-only mode this round.
  There the install command installs nothing and prints the
  `docs/install.md` section for the manual full install.

## Anti-goal

The two variants are never enabled together on one machine. Both have the
manifest name `ryugi`; enabled together, their skills and hooks collide.

## Decisions

| Decision                                                                                                                                                                                                                                    | By                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| No new repository; the workflow stays; add a guided install here                                                                                                                                                                            | owner                            |
| One plugin, a mode chosen at install; artifacts-only turns the workflow off                                                                                                                                                                 | owner                            |
| The Kata split from the earlier rounds is void: its names, hard dependency and migration notice. Nothing is renamed, so nothing migrates                                                                                                    | owner (confirmed in chat)        |
| A second `marketplace.json` entry `ryugi-artifacts`, `source: "./"`, `skills: ["./skills/artifacts", "./skills/interface-craft"]`                                                                                                           | mine, verified below             |
| The guided install is `npx ryugi-artifacts install`, built in `ryugi-cloud`                                                                                                                                                                 | mine, agreed in chat             |
| Artifacts-only covers Claude Code first; Codex after confirming its manifest can expose a subset of skills                                                                                                                                  | mine                             |
| The installer manages user scope only. If project or local scope (the cwd's `.claude/settings.json`, `.claude/settings.local.json`) enables the other variant, it warns with the command and changes nothing                                | mine                             |
| Interactive default follows what is installed: `ryugi` enabled → full, and switching from full to artifacts-only asks again. Nothing installed → artifacts-only                                                                             | mine                             |
| interface-craft still names `ryugi:brainstorming` and `ryugi:verifying` in artifacts-only mode. No skill edit this round; acceptance checks the effect. If it misbehaves, add one line in session-start, with a writing-skills before/after | mine                             |
| Launch: an artboard demo on X for developers building front ends with Claude Code; the landing hero carries the GIF and the install command                                                                                                 | mine, an assumption (unanswered) |

## Verified facts

Claude Code 2.1.322, in a scratch `HOME` on a copy of the repository with
the entry added: `claude plugin validate`, `marketplace add`,
`install ryugi-artifacts@ryugi-dev`, `details`.

| Checked      | Result                                                              | Consequence                                                                                               |
| ------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Skills       | only 2 load: artifacts, interface-craft                             | workflow skills never reach the model's list, so their descriptions cannot trigger                        |
| Namespace    | manifest name stays `ryugi`; skills are `ryugi:artifacts`           | the monitor trigger `on-skill-invoke:ryugi:artifacts` is unchanged                                        |
| Hooks        | all 9 load, SessionStart included                                   | `session-start` must detect the variant, or it injects a using-ryugi that names skills that are not there |
| Install path | `~/.claude/plugins/cache/ryugi-dev/ryugi-artifacts/<version>/`      | the hook can tell the variant from its plugin root                                                        |
| Monitors     | the file is copied into the cache; `details` does not list monitors | the comment monitor is checked in a real session at acceptance                                            |

Docs: a marketplace entry whose source is the marketplace root and lists
`skills` loads only those directories; hooks cannot be subset per entry;
two entries share one manifest name, so enable only one (Claude Code plugin
docs: manifest reference, marketplace reference, loading).

## Changes in this repository

- `.claude-plugin/marketplace.json`: add the `ryugi-artifacts` entry with
  an artifacts-only description.
- `hooks/session-start`: when the plugin root path contains
  `/ryugi-artifacts/`, skip the using-ryugi injection; artifacts autostart
  runs as before. Plain bash, PATH-independent, like the rest of the script.
- `.version-bump.json`: add `plugins.1.version` so both entries bump
  together.
- README and `docs/install.md`: an "Artifacts only" section with
  `npx ryugi-artifacts install` and the manual line
  `/plugin install ryugi-artifacts --marketplace Innei/ryugi`, and that the
  two variants are never enabled together.
- Tests: in `tests/hooks/`, no bootstrap under the artifacts path and the
  usual bootstrap under the full path; in `tests/version-bump/`, the second
  entry.

## Changes in ryugi-cloud

1. **Add `install`** in `packages/artifacts/src/cli/`, registered in
   `commands.ts`, with the existing Brief output and exit codes.
2. **Pick the mode.** Interactive: ask "artifacts only, or the full Ryugi
   workflow", default per the decision above. Non-interactive:
   `--mode artifacts|full`; without it, fail with exit code 3.
3. **Install into Claude Code**, user scope:
   `claude plugin marketplace add Innei/ryugi`, then
   `claude plugin install <ryugi-artifacts|ryugi>@ryugi-dev`. If the other
   variant is enabled, `claude plugin disable` it first and say so. Project
   or local scope enabling the other variant: warn with the command.
4. **Other harnesses.** Without `claude`: print the `docs/install.md`
   section, say these harnesses install the full set by hand, install
   nothing, exit 0. With `claude` and other harnesses: handle Claude Code
   only.
5. **Landing**: the install command and the artboard demo in the `landing/`
   hero.

## Acceptance

- [ ] Clean session with only `ryugi-artifacts`: `details` lists 2 skills;
      "Let's make a react todo list" does not start brainstorming;
      "Show me three directions for a settings page" opens an artboard; an
      artboard comment reaches the agent (the monitor started).
- [ ] With only `ryugi-artifacts`, a UI mockup that uses interface-craft:
      the agent does not invoke the missing `ryugi:brainstorming` or
      `ryugi:verifying`, and does not ask for a spec first.
- [ ] On a machine with `ryugi` enabled, `npx ryugi-artifacts install` and
      Enter: still full.
- [ ] Clean session with only `ryugi`: the todo list request starts
      brainstorming, as today.
- [ ] Switching artifacts → full with `install --mode full` leaves only
      `ryugi` enabled.
- [ ] The test suites for the changed files pass.

Estimate: this repository 2–3 hours; the `ryugi-cloud` install command 2–3
hours, landing extra; acceptance 1 hour. Release order as usual:
`ryugi-artifacts` to npm first, then the plugin.

## Left to the builder

- Install prompt wording and each output line.
- When the path check cannot tell (local development through the
  `~/.claude/skills/ryugi` symlink), treat it as full.
- Landing layout and demo material.
