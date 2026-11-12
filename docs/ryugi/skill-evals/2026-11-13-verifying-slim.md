# Skill eval: verifying, slimmed

Date: 2026-11-13. Runner: `codex exec` 0.167.2, model `gpt-6.1-sol`, medium
reasoning effort, read-only sandbox, a private `CODEX_HOME` holding only
the sign-in. Design: `docs/ryugi/specs/2026-11-13-skill-body-slimming-design.md`.
Harness as in `2026-11-13-executing-specs-slim.md`. Scenarios and rubrics are the round-2 set of
`2026-11-11-verifying`, unchanged; files are in `2026-11-13-verifying-slim/`.

## Change

| File          | Before | After  |
| ------------- | ------ | ------ |
| `SKILL.md`    | 16,446 | 10,023 |
| `pages.md`    | —      | 4,367  |
| `verdicts.md` | —      | 2,562  |

Bytes; ceiling 11,500.

- The verify report, The verify page on the artboard and Prepare each
  recording moved to `pages.md`, read before writing a report or a page.
- When verdicts come back moved to `verdicts.md`, read when a verdict
  arrives. The definition of Done stays in the body.
- Red Flags is unchanged.
- One clause was added after the first run (below): the small-visible-change
  row now ends "No page, and no verdict to wait for."

## Results

Five runs per scenario and arm; s3 was rerun at ten.

| Scenario | Baseline | Candidate | Candidate + clause | Moved file read (candidate)       |
| -------- | -------- | --------- | ------------------ | --------------------------------- |
| s1       | 4/5      | 4/5       |                    | `pages.md` 5/5                    |
| s2       | 0/5      | 0/5       |                    | `pages.md` 5/5                    |
| s3       | 9/10     | 1/5       | 10/10              | none needed                       |
| s3b      | 5/5      | 5/5       |                    | none needed                       |
| s4       | 5/5      | 5/5       |                    | `pages.md` 5/5                    |
| s5       | 5/5      | 5/5       |                    | `verdicts.md` 5/5                 |
| s6       | 5/5      | 5/5       |                    | `verdicts.md` 5/5                 |
| s7       | 5/5      | 5/5       |                    | `pages.md` 5/5                    |
| s8       | 5/5      | 5/5       |                    | `pages.md` 5/5                    |
| s9       | 5/5      | 5/5       |                    | `pages.md` 5/5, `verdicts.md` 5/5 |

- **s3 ("make the Save button padding 12px").** The first candidate proved
  the change inline and then waited for the partner's visual verdict in
  four of five runs. With the report, page and verdict sections out of the
  body, nothing nearby said that a small change has no verdict. The added
  clause brought it to 10/10 against the baseline's 9/10.
- **s2** fails in both arms the same way: layout and motion share one
  verify group. The skill has this gap before and after the change.
- **s1**: one run per arm gave a unit-test claim a `from` naming only the
  local checkout.

## Limits

- The shipped text (candidate + clause) was run only on s3. The other nine
  cells were run on the candidate without that clause.
- One model at one effort. No Claude run. Simulation, apart from reads
  under `./skill/`.
- Four stray files from a mis-typed launch (`*-s1-sync-fix-s2-ui-spec.*`)
  are not part of the results and are not committed.
