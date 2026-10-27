# Skill eval: mark unwritten sections with `<pending>`

Date: 2026-10-22. Model: Claude Sonnet (subagent, fresh context per run).
Harness: Claude Code subagents, file reads only, no commands.

## Why

In a real Codex session the agent saved an outline of ten bare `h2`
headings, opened the document, then researched for minutes before writing
any body. The reader saw headings with nothing under them and could not tell
whether the agent was still working, what each section would cover, or where
it would write next.

## Method

Each run read one `document.md` and a shared scenario: a Chinese architecture
document with four sections and every fact supplied, so no research was
needed. The agent output two files: the first `doc.xml` it would save, and
the file after writing only the second section's body (with server ids
assumed on every block from step 1). This checks the reference's wording,
not the server or the viewer.

Pass criteria:

- Step 1: every planned section is a heading followed by
  `<pending intent="…"/>`.
- Step 2: only the filled section's `<pending>` is replaced; the other
  sections keep their `<pending>` and ids.

## Before and after

| Reference                                   | Runs | Step 1 marks every section | Step 2 replaces only the filled section |
| ------------------------------------------- | ---: | -------------------------: | --------------------------------------: |
| Baseline (`document.md` before this change) |    2 |      0 / 2 (bare headings) |                                     n/a |
| Candidate (this change)                     |    5 |                      5 / 5 |                                   5 / 5 |

All five candidate runs converged on the same shape: heading, then a
one-line `intent` naming the section's content; step 2 kept the three other
`<pending>` blocks with their ids and placed the body where the filled
section's `<pending>` had been.

## Change

`Show the document early` now asks for each planned section as a heading
plus a `<pending>` block, explains what the viewer does with it, and says to
replace a section's `<pending>` with its body in the same save. The document
is finished when no `<pending>` is left. The LiteXML list names the tag.
