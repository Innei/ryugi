# Skill eval: write known sections before researching

Date: 2026-10-23. Model: Claude Opus 5.5 (`claude -p`, project settings
only, no plugins, skills or MCP servers). Harness: Claude Code 2.1.309.

## Why

After saving the outline, agents researched every section first and then
wrote the whole document in one save. Sections they could already write sat
as placeholders while they read code, and a long lookup made the viewer
look stale. Your human partner wanted the agent to write what it knows
before each lookup, in any order and revising earlier sections, without
going back to one tool call per section.

## Method

Each run got a copy of `artifacts/src/server`, one `document.md` as
`RULES.md`, and a Chinese task: a six-section document on document
comments. The task's notes cover sections 1, 5 and 6; sections 2–4 need the
code. No server ran. The tool-call timeline was read from stream-json.

Pass criteria:

- Known: sections 1, 5 and 6 have a body in a save made before the first
  code lookup.
- Intent: each section still waiting names what is being checked.
- Every run must end with six sections, no `<pending>` and valid XML.

## Before and after

| Reference                                   | Runs | Known before lookup | Intent names the lookup | Complete |
| ------------------------------------------- | ---: | ------------------: | ----------------------: | -------: |
| Baseline (`document.md` before this change) |    2 |               0 / 2 |                   0 / 2 |    2 / 2 |
| V1 ("save what you have" before a lookup)   |    5 |               2 / 5 |                   5 / 5 |    5 / 5 |
| V2 (this change)                            |    3 |               3 / 3 |                   3 / 3 |    3 / 3 |

Baseline runs saved an outline, read code five or six times, then wrote
everything at once. V1 runs that failed treated "save what you have" as the
outline: they rewrote the intents and researched with every section empty.
V2 names the order: bodies of known sections before the first lookup. All
three V2 runs put sections 1, 5 and 6 into the first save with the outline,
then filled 2–4 in one save or one edit per section. Durations (68–120 s)
and turns (6–15) overlapped across all variants.

## Change

`Show the document early` now says to look up only what the structure needs
before the outline, to write every section already writable before the
first lookup in any order, to set a waiting section's `intent` to what is
being checked, and to revise earlier sections as the agent learns more. The
fill and streaming paragraphs were folded in; re-reading and id rules stay
in `Editing doc.xml`. CJK examples in `document.md`, `artboard.md` and
`ui.md` became English.

Raw stream-json, final documents, the task and each reference variant are
kept locally under `.ryugi/evals/document-research-passes-20261023/`.
