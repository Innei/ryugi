# Skill eval: document steps

Date: 2026-10-23
Change: `skills/artifacts/document.md` adds `<steps>` / `<step title>` to the LiteXML example. A new paragraph says when to use it instead of `<ol>`.
Method: `writing-skills` subagent scenario, Sonnet, one run each. The skill files were copied to a scratch directory: baseline = `SKILL.md`, `document.md`, `html.md` and `ui.md` from `main` before the change, with = the same files after it. The agent read only those files and wrote `doc.xml`. Both outputs were checked with `parseDocument`. The "with" output was then opened in a locally built viewer (haklex 0.54.0).

## Scenario: a procedure the reader follows step by step

Prompt: 把在 macOS 上从零搭建本地 Redis + Node 开发环境写成一篇 document：从安装 Homebrew 到用一个 Node 脚本连上 Redis 并读写一个 key，大约五步。每步要有命令（代码块）和一两句注意事项，读者会边看边照着一步步做。

| Part | Baseline | With change |
|---|---|---|
| Step structure | five `<h2>步骤 N：…</h2>` sections, plus an `<ol>` overview repeating the titles | one `<steps>` holding five `<step title="…">` |
| Numbering | typed into each heading | supplied by the viewer; titles carry no numbers |
| Commands and caveats | `<codeblock>` plus an `<alert>` per step | `<codeblock>` and `<p>` inside each step |
| Content after the procedure | n/a | a closing `<h2>` section outside `<steps>`, so it is not counted as a step |
| `parseDocument` | ok | ok |
| In the viewer | n/a | renders as a numbered rail. Text typed into a step's content reached `doc.xml` with no other edit (haklex 0.54.0 syncs nested editors) |

The baseline agent said the skill had no step tag, so it built the steps from headings. It also avoided putting block content inside `<li>`, because the skill never said that was allowed. With the change, the agent used `<steps>` on the first run and gave the "more than a line per step" rule as its reason.
