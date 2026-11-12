# Skill eval: artifacts, slimmed

Date: 2026-11-13. Runner: `codex exec` 0.167.2, model `gpt-6.1-sol`, medium
reasoning effort, read-only sandbox, a private `CODEX_HOME` holding only
the sign-in. Design: `docs/ryugi/specs/2026-11-13-skill-body-slimming-design.md`.
Harness as in `2026-11-13-executing-specs-slim.md`. Files are in `2026-11-13-artifacts-slim/`.

## Change

| File       | Before | After  |
| ---------- | ------ | ------ |
| `SKILL.md` | 13,797 | 11,122 |
| `cloud.md` | —      | 3,279  |

Bytes; ceiling 11,000, inside the 10% allowance.

Read a Ryugi Cloud link, Share a link and Auto-publish moved to `cloud.md`.
The body keeps a Ryugi Cloud section naming when to read it (a pasted Cloud
link; a link for someone else, a phone or another machine; publishing or
visibility; the auto-publish question) and the rule never to run `publish`
otherwise. Nothing else changed.

## Results

Five runs per scenario and arm, 50 sessions.

| Scenario | Situation                                  | Wanted                                 | Baseline | Candidate | `cloud.md` read |
| -------- | ------------------------------------------ | -------------------------------------- | -------- | --------- | --------------- |
| a1       | "Something I can play with" for one easing | `html`, reads `html.md`, `check`, link | 5/5      | 5/5       |                 |
| a2       | A pasted Cloud link to read                | `get <link>` through the launcher      | 5/5      | 5/5       | 5/5             |
| a3       | "A link my teammate can open"              | `publish --public`, the printed URL    | 5/5      | 5/5       | 5/5             |
| a4       | Edit a document, auto-publish on           | `check`, no `publish`                  | 5/5      | 5/5       | 0/5, as wanted  |
| a5       | `check` prints `W_MODULES`                 | Reads `modules.md`, tags, checks again | 5/5      | 5/5       |                 |

No cell is below the baseline. Nothing was restored.

## Limits

- One model at one effort. No Claude run. Simulation, apart from reads
  under `./skill/`.
- Equal scores show the cuts broke none of these behaviours; a rule no
  scenario exercises is untested.
