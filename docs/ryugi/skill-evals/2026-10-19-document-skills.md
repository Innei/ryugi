# Skill eval: document artifact type

Date: 2026-10-19
Change: `skills/artifacts/SKILL.md` type table and description, new `skills/artifacts/document.md`, `skills/artifacts/html.md` "what pages are for", `skills/brainstorming/SKILL.md` (Artboard pointer, artifact citations, ADHD TL;DR).
Method: `writing-skills` subagent scenarios, Sonnet, skill files copied to a scratch directory; baseline = files at `main`, with = files on this branch. Decision exercises, no tools beyond reading the skill.

## Scenario 1: which artifact

| Prompt                             | Expected   | Baseline                                          | With change                        |
| ---------------------------------- | ---------- | ------------------------------------------------- | ---------------------------------- |
| 我们来讨论一下 Relay 同步的架构    | `document` | none ("nothing here needs a visual")              | `document/relay-sync-architecture` |
| 帮我调一下这个箭头的旋转角度和粗细 | `html`     | `html/arrow-tuner`                                | `html/arrow-tuner`                 |
| 给设置页的导航出几版设计我挑一下   | `artboard` | `artboard/settings-nav`                           | `artboard/settings-nav`            |
| 把 app 里所有文案过一遍，我逐条看  | `document` | `html/copy-audit` ("a review or report, so html") | `document/copy-audit`              |

## Scenario 2: writing the spec after using an artboard and a document, human partner has ADHD

| Check                                     | Baseline                            | With change                                                                                      |
| ----------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Cites each artifact with path             | yes (under "Decided")               | yes, own section with type, id, path, decision                                                   |
| Separate TL;DR file for the human partner | no: a TL;DR section inside the spec | yes: `<spec>.tldr.md` beside the spec, with steps, decisions table, "check these", time estimate |

Citations already happened at baseline; the added line makes the decision text explicit. The TL;DR file is new behavior.

## Scenario 3: working a document (with change only)

Asked "看一下评论，顺便把第 4 节补上阈值的结论" with a stale copy of doc.xml in context. The agent read comments.json first, re-read doc.xml, appended an agent message without touching the human's, edited only the section 4 blocks in place keeping ids, and checked warnings.json after. No baseline: the type did not exist.

## Scenario 4: numbers in a document (`<chart>` in `document.md`)

Date: 2026-10-20. Change: the LiteXML example in `skills/artifacts/document.md` gains a `<chart>` block and a ChartSpec summary. Baseline = `document.md` before the change. Sonnet, one run each, reading only the reference and replying with doc.xml.

Prompt: a sync architecture review with three data sets (payload per case, p95 by week, client share by platform) and one open decision; "present the numbers in whatever form the reference supports best".

| Check                             | Baseline    | With change                                              |
| --------------------------------- | ----------- | -------------------------------------------------------- |
| Form chosen for the numbers       | 3 `<table>` | 3 `<chart>` (bar, line, bar), 0 tables                   |
| `parseDocument`                   | ok          | ok                                                       |
| `validateChartSpec` on each chart | n/a         | all ok; used `format.unit`, `highlight`, `note`, `y.max` |
