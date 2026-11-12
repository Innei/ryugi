# TL;DR: skill body slimming

**What gets built:** seven of the nine `SKILL.md` bodies get shorter. The
nine go from 109,413 bytes to at most 81,000 (about −26%, roughly 7k tokens
on a full project run). No rule, gate or step order changes.

**Why:** a body is paid in full on every load and again after each
compaction. A UI project from idea to verified loads seven bodies, about
24k tokens, before any reference file.

## What you'll see

1. A worktree `.worktrees/slim-skills` on branch `slim-skills`. The live checkout is not touched until you land it.
2. One commit per skill, in this order: executing-specs, test-driven-development, verifying, systematic-debugging, artifacts, brainstorming, using-git-worktrees.
3. Five new sibling files, each read only on its branch: `executing-specs/landing.md`, `executing-specs/exploring.md`, `verifying/verdicts.md`, `verifying/pages.md`, `artifacts/cloud.md`.
4. One eval record per skill in `docs/ryugi/skill-evals/`, baseline against candidate, five runs per scenario.
5. A final table: bytes before and after per skill, and anything put back because its scenario failed.

## Decisions

| Decision                         | Choice                                                     | By   |
| -------------------------------- | ---------------------------------------------------------- | ---- |
| Scope                            | the nine `SKILL.md` bodies                                 | you  |
| Descriptions, reference files    | out                                                        | you  |
| using-ryugi, interface-craft     | untouched                                                  | mine |
| Target                           | ≤ 81,000 bytes total, a ceiling per skill                  | mine |
| Sections moved to sibling files  | allowed, for later-turn and rare-branch sections only      | mine |
| Red Flags / rationalization rows | kept; a row goes only when its scenario passes without it  | mine |
| Pass bar                         | no scenario below baseline; a one-run drop is rerun at ten | mine |
| Runner                           | `codex exec`, not `claude -p`                              | you  |
| Model and effort                 | Codex default model, medium effort                         | mine |

## Check these

- **Eval spend:** about 700 `codex exec` sessions on your Codex account, most of them short.
- **Lazy files:** `verifying` loses its report, page and verdict sections to `pages.md` and `verdicts.md`. Small inline proofs get cheaper; page-size work pays one extra read.
- **Upstream drift:** test-driven-development and systematic-debugging move further from Superpowers v7.0.0 text.
- **Largest cut:** executing-specs loses its digraph and its example transcript (4,733 bytes together).

## Time

About 2 working days of agent time: half a day for executing-specs with its new scenarios, 2 to 3 hours for each of the other six.
