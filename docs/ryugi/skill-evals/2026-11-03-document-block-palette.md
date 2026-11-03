# Skill eval: document block palette instead of a form table

Date: 2026-11-03. Models: Codex `gpt-6.1-sol` (`codex exec`), Claude Sonnet
(Claude Code subagents). Change: `skills/artifacts/document.md` "Before
writing: choose how to tell it" drops the four-row "reader needs to grasp →
lead with" table for the whole block set with what each can carry, says no
content kind maps to a block, and warns against blocks chosen for variety.
"Diagrams" allows `<excalidraw>` beside `<mermaid>`. `SKILL.md` adds
reports to the document type.

Trigger: Codex wrote nine lobe-chat test-audit documents. Every one had a
single mermaid diagram and no chart, including a coverage before/after
report full of percentages. It added charts only after the human partner
asked "你没有 chart node 可以写吗". The partner judged the four-row table too
prescriptive: listed forms got used, unlisted blocks were decoration.

## Method

Written scenarios, no server. Each run read one guide (A: `HEAD`, B:
candidate), a brief, and the lobe-chat `AGENTS.md` diagram rule, then wrote
`doc.xml`.

- **Coverage:** the real coverage before/after numbers from that session.
- **Audit:** the real M02 module audit numbers (per-rule counts, test
  totals, cumulative progress).
- **Memo:** a long-poll vs SSE decision with almost no numbers; control for
  charts forced where none help. Sonnet only.

## Before and after

| Run               | Charts | Other blocks beyond p / table / one mermaid  |
| ----------------- | ------ | -------------------------------------------- |
| Codex A coverage  | 0      | alert 2, details, ask (7 tables, no diagram) |
| Codex B coverage  | 1      | alert 4, steps, details, ask                 |
| Codex A audit     | 0      | alert 1 (7 tables)                           |
| Codex B audit     | 0      | alert 3, steps, details 2, footnotes         |
| Sonnet A coverage | 0      | alert 3, ask 2                               |
| Sonnet B coverage | 2      | alert 4, steps, details, ask 3               |
| Sonnet A audit    | 1      | alert 2, details, ask                        |
| Sonnet B audit    | 3      | alert 2, ask 5                               |
| Sonnet A memo     | 0      | alert 2, ask                                 |
| Sonnet B memo     | 0      | alert, details, ask                          |

Charts went from 1 of 4 numeric runs to 3 of 4. Codex A reproduced the
original failure in both briefs; Codex B charted gained vs lost coverage
(the chart the partner would have wanted) but still put the audit's
per-rule counts and module progress in tables. Tables per Codex document
fell from 7 to 4–5. Neither memo drew a chart.

Side effect: alerts rose to 3–4 per document in B, and one Codex B alert
holds a routine status line (worktree file count). Sonnet B audit put an
`<ask>` on each of five weak-spot rows.

## Round 2: sharpen chart, table and alert

Change: the palette rows now separate `<chart>` ("numbers whose comparison,
trend or split is the point") from `<table>` ("exact values and attributes a
reader checks one by one"), `<alert>` becomes "the rare line", and the
variety warning adds "emphasis spent on every line marks none". Codex only,
two runs per brief (C).

| Run                | Charts | Alerts | Tables |
| ------------------ | ------ | ------ | ------ |
| Codex C coverage 1 | 1      | 2      | 3      |
| Codex C coverage 2 | 1      | 2      | 3      |
| Codex C audit 1    | 0      | 1      | 6      |
| Codex C audit 2    | 0      | 1      | 6      |

Both coverage runs charted gained vs lost coverage, as Codex B did, so the
original failure is fixed in 3 of 3 Codex runs. Alerts fell from 3–4 to 1–2
per document, each a verdict or the one loss. Audit runs still drew no chart:
their per-rule counts sit in rows that also carry example text, and the
progress numbers are two modules, so a table is a defensible choice there.
Sonnet B's 850 → 822 bar chart was the kind of decoration the guide warns
against.

## Round 3: spatial briefs

Guide C, two new briefs with real numbers from ryugi-cloud: the document ↔
artboard split-view layout (pane ratio 0.58 clamped 0.25–0.75, 44 px header,
37 px toolbar, phone ≤ 640 px) and the group frame / camera fit geometry
(`GROUP_PAD` 48, `GROUP_TOP` 144, fit margin 0.9). The memo brief ran on
Codex as the control.

| Run              | Excalidraw | Mermaid | Other                                |
| ---------------- | ---------- | ------- | ------------------------------------ |
| Codex split 1    | 3          | 0       | table 2, steps, details, ask 2       |
| Codex split 2    | 4          | 1       | table 3, details 2, ask 2            |
| Codex geometry 1 | 1          | 1       | math 11, steps, details 2, footnotes |
| Codex geometry 2 | 2          | 0       | math 20, steps, details 3            |
| Sonnet split     | 1          | 3       | table 2, ask 2                       |
| Sonnet geometry  | 1          | 1       | chart (line), dynamic, math, table   |
| Codex memo       | 0          | 1       | table, details, ask                  |

Every spatial run drew Excalidraw; the memo drew none. Scenes are valid
JSON with labelled geometry (pane widths 696 / 503 px at 1,200 px, the
936 × 1036 frame), and `check` passes. Codex split each scene to one state
(desktop, header, artboard entry, phone) and kept the bidirectional
positioning flow in mermaid. Scenes were not inspected rendered.

## Not covered

One run per cell. Codex A coverage also read `~/.agents/skills/artifacts/SKILL.md`,
which is the candidate wording; its `document.md` came from guide A. Charts
were counted, not rendered.
