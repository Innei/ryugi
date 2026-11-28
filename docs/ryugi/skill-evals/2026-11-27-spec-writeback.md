# Skill eval: write verify conclusions back into the spec

Date: 2026-11-27. Runner: `claude -p` with `claude-fable-5-2` (only the Read
tool, no settings, no MCP). Grader: `claude -p` with `claude-opus-5-5`, one
line per transcript. Files: `2026-11-27-spec-writeback/` (`run.sh`,
`grade.sh`, scenarios, rubrics, runs, grades).

## Change

`verifying/pages.md` gains "Write back to the spec": when the spec names a
design document that still exists, the agent ends it with a section on how
it was built (a verify reference, the differences from the spec, the points
the spec left open, the pitfalls), puts a reference under each section the
build departs from, and updates it after each repaired reject.
`executing-specs/SKILL.md` points its Finish at that section. Baseline is
both files before the change.

## Scenarios

- **w1-handoff**: first handoff of a doc-backed spec; one ruling departs from
  the design, one settles a point it left open, one debugging pitfall.
- **w2-repair**: the partner rejected a ruling; it was repaired, with a new
  pitfall. The document already has the section from the last handoff.
- **w3-no-design**: a plain markdown spec with no design document; nothing
  should be written back.

## Results (3 runs each)

| Scenario     | Baseline | Candidate | Candidate after the tweak |
| ------------ | -------- | --------- | ------------------------- |
| w1-handoff   | 0/3      | 2/3       | 4/4                       |
| w2-repair    | 2/3      | 3/3       | not rerun                 |
| w3-no-design | 3/3      | 3/3       | not rerun                 |

Baseline w1 only dropped refs into the document; no run wrote the section.
Baseline w2 mostly passes because the section from the last handoff is
already in the scenario and invites an update; one run wrote the verdict
("否决") into the document.

The one candidate failure in w1 listed the point the spec left open under
"differences" while labelling it unspecified. The tweak: points the spec
left open go in a list of their own after the differences, never among
them. w1 then passed 4/4 (`runs/fable-r2-*`).
