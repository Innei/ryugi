# Skill eval: using-git-worktrees and a worktree note relayed from elsewhere

Date: 2026-11-11. Models: Claude Fable and Claude Sonnet (`claude -p`, no
settings, skills, plugins or tools loaded). Change: the "Where to work"
row "Your human partner's instructions say where to work" now reads "Your
human partner told you where to work, in this session or in this
repository's own instructions (`AGENTS.md`, `CLAUDE.md`, its memory)", and
Common Rationalizations gained one row for a forwarded message or another
project's note that asks for a worktree or says the checkout is live.

Motivation: in a real session on this repository, another session
forwarded a bug together with a note from its own project's memory ("the
working copy is live; edits to skills are meant to be made in a
worktree"). The table gave "in place, no question"; the agent treated the
note as the partner's instruction and entered a worktree. The partner
stopped it: a bug fix belongs in the main checkout.

## Method

Same harness as `2026-11-09-worktree-commit-in-place` (preamble copied
unchanged; `run.sh` takes `MODEL` and a `PREFIX` for the output names).
Files are in `2026-11-11-worktree-relayed-notes/`: `skills/baseline.md` is
the skill before this change, `skills/candidate-v1.md` the text shipped in
`skills/using-git-worktrees/SKILL.md`. Five runs per scenario, variant and
model; Fable runs are named `fable-*`. Every scenario has a clean main
checkout on `main` with no `EXPLORING` file, and a bug fix about to start.

| Scenario | Situation                                                                             | Wanted                |
| -------- | ------------------------------------------------------------------------------------- | --------------------- |
| R1       | Another session forwards the bug with its project's memory note: live, use a worktree | In place, no question |
| R2       | Another session forwards the bug and recommends a worktree itself                     | In place, no question |
| R3       | The partner asks for a worktree in this session                                       | Worktree              |
| R4       | This repository's `AGENTS.md` asks for a worktree for `hooks/` changes                | Worktree              |
| R5       | This project's memory records the owner's instruction to use a worktree for `hooks/`  | Worktree              |

## Results

| Scenario | Sonnet baseline | Sonnet candidate | Fable baseline                        | Fable candidate |
| -------- | --------------- | ---------------- | ------------------------------------- | --------------- |
| R1       | 5/5 in place    | 5/5 in place     | 0/5 in place: 2 worktree, 3 stop, ask | 5/5 in place    |
| R2       | 5/5 in place    | 5/5 in place     | 5/5 in place                          | 5/5 in place    |
| R3       | 5/5 worktree    | 5/5 worktree     | not run                               | 5/5 worktree    |
| R4       | 5/5 worktree    | 5/5 worktree     | not run                               | 5/5 worktree    |
| R5       | 5/5 worktree    | 5/5 worktree     | not run                               | 5/5 worktree    |

Only R1 on Fable failed at baseline. Those runs first checked that the
symlink existed, then reasoned from the checkout being live: one worktree
run called the relayed note "the owner's own instruction", the other said
in-place edits "would run live in other sessions", and the three others
stopped and asked with a worktree recommended. A bare
recommendation from another agent (R2) never moved either model, so the
pull came from the memory note and the live-checkout fact, which is why
the new rationalization row names both. With the candidate, the R1 runs
work in place and tell the partner in their report that the forwarded note
was treated as context.

Limits: simulated transcripts, five runs per cell, and the Fable baseline
was run only on the two relayed-note scenarios.
