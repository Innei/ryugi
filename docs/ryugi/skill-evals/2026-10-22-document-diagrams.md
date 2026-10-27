# Skill eval: draw document diagrams with `<mermaid>`

Date: 2026-10-22.

## Why

A real Codex session wrote an architecture document with seven flow
diagrams, every one of them box-drawing art in a code block. The project's
`AGENTS.md` asked for box-drawing diagrams; that rule is meant for code
comments and Markdown, not a rendered document. In the viewer the art showed
as monospaced text: Chinese labels broke the box edges, narrow screens
clipped it, and it could not be zoomed.

## Method

A disposable directory held an `AGENTS.md` containing only the box-drawing
diagram rule (so the harness loads it as project instructions), the
`document.md` under test, and a task: a Chinese document explaining a publish
flow and how a browser reads the page, with every fact supplied. The agent
output the finished `doc.xml`.

Each run counted `<mermaid>` blocks, `<codeblock>` blocks and lines containing
box-drawing characters, then the mermaid sources of one run were read by hand.

## Before and after

| Model / harness                                               | Reference | Runs |          Used `<mermaid>` |                        Drew box-drawing art |
| ------------------------------------------------------------- | --------- | ---: | ------------------------: | ------------------------------------------: |
| Claude Sonnet / Claude Code subagent, rule quoted in the task | Baseline  |    3 |                     3 / 3 |                                       0 / 3 |
| `gpt-6.1-sol` / Codex CLI 0.162.1, rule in `AGENTS.md`        | Baseline  |    3 |                     0 / 3 | 3 / 3 (3 code blocks, 37–42 art lines each) |
| `gpt-6.1-sol` / Codex CLI 0.162.1, rule in `AGENTS.md`        | Candidate |    5 | 5 / 5 (2–3 diagrams each) |                                       0 / 5 |

The Sonnet control did not show the failure, so the wording was tested on
the harness that did. Candidate diagrams were real sequence and flowchart
sources covering the publish path and the label branch.

## Change

- `document.md` gains a Diagrams section: the document is a rendered page,
  every flow, sequence, state or architecture diagram is a `<mermaid>` block,
  and diagram rules for code comments or Markdown do not apply.
- The server reports a code block drawn with box-drawing characters in
  `warnings.json`, so the rule holds even when an agent skips the reference.
- Replacing a large block with a small one, or removing a block the agent
  added earlier, no longer leaves the old block behind: the merge base is
  chosen only among copies no older than the agent's previous write, since the
  agent has seen at least that one.
- The server reports box-drawing diagrams only when a code block has several
  boxes joined by arrows, so boxed program output (tables, update notices) is
  left alone. The warning is recomputed whenever the document is saved, and a
  rejected edit shows only the rejection.
