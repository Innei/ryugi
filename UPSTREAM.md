# Upstream

Ryugi is a fork of [obra/superpowers](https://github.com/obra/superpowers) (MIT).

## Baseline

|                  |                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream release | **v7.0.0**                                                                                                                                                     |
| Upstream commit  | `bb92a77741419a4ab5f06e711a283343f1ada0c3`                                                                                                                     |
| Released         | 2026-10-10 (UTC)                                                                                                                                               |
| Last checked     | 2026-10-28 — upstream `main` is v7.0.1 (`2ce8aa15`); `dev` (`b58deb3b`) adds unreleased hook fixes. Baseline stays v7.0.0 until the remaining skill ports land |

Ryugi's git history was re-initialized and shares no commits with upstream, so
upstream changes can't be merged. Follow them by diffing upstream against the
baseline and porting through the path map below.

## Checking for upstream changes

```bash
git remote add upstream https://github.com/obra/superpowers.git # once per clone
git fetch upstream --tags

git log --oneline v7.0.0..upstream/main # released changes since the baseline
git diff --stat bb92a77 upstream/main   # what files they touched
git diff bb92a77 upstream/main -- skills/test-driven-development
git diff --stat bb92a77 upstream/dev # unreleased work: compare trees, not logs
```

Upstream releases land on `main` by rebase-merge, and `dev` keeps the original
commits, so `git log` against `dev` lists old work again. Use `git diff` for `dev`.

## Path map

| Upstream                                                                                                                          | Ryugi                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `superpowers` / `Superpowers` / `SUPERPOWERS`                                                                                     | `ryugi` / `Ryugi` / `RYUGI` (plugin name, `ryugi:` namespace, env vars)                  |
| `.superpowers/` (project working dir)                                                                                             | `.ryugi/`                                                                                |
| `skills/using-superpowers/`                                                                                                       | `skills/using-ryugi/` (adds Evidence Before Claims and the project-skills rule)          |
| `skills/executing-plans/`                                                                                                         | `skills/executing-specs/` (input is an approved spec; the executor writes `tasks.md`)    |
| `skills/subagent-driven-development/scripts/{sdd-workspace,task-brief,review-package}`                                            | `skills/executing-specs/scripts/`                                                        |
| `skills/requesting-code-review/code-reviewer.md`                                                                                  | `skills/executing-specs/code-reviewer.md`                                                |
| `skills/finishing-a-development-branch/` worktree cleanup                                                                         | `skills/using-git-worktrees/` Cleanup section                                            |
| `skills/verification-before-completion/`                                                                                          | Evidence Before Claims in `skills/using-ryugi/`                                          |
| `skills/brainstorming/` visual companion                                                                                          | `skills/artifacts/` (rewritten: local artboard + html artifacts, source in `artifacts/`) |
| `skills/writing-skills/`                                                                                                          | `.claude/skills/writing-skills/` (repo-local)                                            |
| `skills/writing-plans/`, `skills/dispatching-parallel-agents/`, `skills/diagnosing-superpowers/`, `skills/receiving-code-review/` | removed                                                                                  |
| `docs/superpowers/`, `docs/plans/`, `RELEASE-NOTES.md`                                                                            | removed (Ryugi specs live in `docs/ryugi/specs/`)                                        |

Closest to upstream, so the easiest to port: `skills/test-driven-development/` (apart from the
hand-off to `using-git-worktrees`),
`skills/systematic-debugging/` (apart from the hand-offs to `verifying-ui`), and the harness integrations (`hooks/`, `.codex-plugin/`,
`.opencode/`, `.pi/`, `.hermes-plugin/`, `.kimi-plugin/`, `.devin-plugin/`,
`.cursor-plugin/`, `.antigravity-plugin/`, `.muse-plugin/`, `gemini-extension.json`).

Rewritten around Ryugi's workflow, so port ideas rather than diffs:
`skills/brainstorming/` (handoff and Artboard sections), `skills/executing-specs/`,
`skills/using-git-worktrees/` (Where to work table; upstream's native-tool rule and
Cleanup survive), `skills/using-ryugi/`, `README.md`, `AGENTS.md`.

## Porting a change

1. Diff the upstream change against the baseline and map its paths with the table.
2. Apply it by hand, or with `git diff bb92a77 <upstream-ref> -- <path> > change.patch`, rewrite the paths, then `git apply change.patch`.
3. Rename `superpowers` to `ryugi` in whatever the patch adds.
4. Run the tests for what it touched; skill-content changes also need the before/after eval from `writing-skills`.
5. Record the sync below and move the baseline forward when everything up to an upstream release has been ported or deliberately skipped.

## Sync log

| Date       | Upstream ref                            | Ported                                                                                                                                                                                                                                                                                                                    | Skipped                                                                                                                                                                                                                                                    |
| ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-19 | v7.0.0 (`bb92a77`)                      | Fork baseline                                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                                                          |
| 2026-10-28 | v7.0.1 (`2ce8aa15`), `dev` (`b58deb3b`) | Infra only: PR/issue templates + `AGENTS.md` human-summary and issue-ownership rules; `hooks.json` `powershell` key (all three hooks); `run-hook.cmd` no-subshell Unix half + `zsh`/quiet-exit fallback; `.muse-plugin` hook runs `bash`; Pi drops `resources_discover` in favour of `pi.skills`; docs and tests for each | v7.0.1 skill changes (brainstorming retune, references splits, `executing-plans` trim); `tests/skill-size`; `hooks/session-start` zero-fork rewrite (conflicts with Ryugi's artifacts-server block); upstream version bumps (Ryugi versions independently) |
