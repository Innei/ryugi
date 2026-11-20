# Spec as a pointer: brainstorming converge and handoff

Date: 2026-11-20. Change: `skills/brainstorming/written-design.md` (TL;DR removed, pointer spec, commit the document), `doc-rounds.md` Converging (approval question), `builder-check-prompt.md` (read through `get --detail`), `SKILL.md` handoff wording, `skills/executing-specs/SKILL.md` and `code-reviewer.md` (pointer specs), `skills/artifacts/SKILL.md` (document `--detail` is markdown). Design: `.ryugi/artifacts/document/spec-as-pointer/doc.xml`.

## Scenario

A fresh sonnet subagent reads the skill files (read only, no commands, no network) and describes what it does after the last doc round of a project in `document/retry-policy`, for a partner with ADHD, through the executing-specs first read. Three runs per arm; the baseline arm read a copy of the skills taken before the change.

## Results

| Behavior                                                | Baseline (3)        | With change (3)                   |
| ------------------------------------------------------- | ------------------- | --------------------------------- |
| Writes `<spec>.tldr.md`                                 | 3                   | 0                                 |
| Copies the full design to `docs/ryugi/specs/`           | 3                   | 0                                 |
| Writes a pointer spec (5–7 lines)                       | 0                   | 3                                 |
| Commits `.ryugi/artifacts/document/<id>/` with the spec | 0                   | 3                                 |
| Approval through an `approve` ask on the document       | 0 (chat "approved") | 3                                 |
| Builder check reads the design                          | raw `doc.xml` 3     | `get --detail` 3                  |
| executing-specs reads the design                        | the `docs/` copy 3  | `get --detail` from the pointer 3 |

Baseline runs named the gap themselves: "The baseline gives no mechanism for approval", "the builder check reads the artifact's XML, but executing-specs reads the markdown copy". With the change, the three runs produced the same pointer shape and the same commit set.
