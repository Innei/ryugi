# Skill eval: choose how to tell a document before writing it

Date: 2026-10-27. Model: Claude Sonnet (Claude Code subagents). Change:
`skills/artifacts/document.md` gains "Before writing: choose how to tell it"
before "Show the document early": the first screen carries the overview and
what the document asks of the reader, four starting forms keyed to what the
reader must grasp (structure, decision, change, flow), explicitly not a
template, and diagrams as `<mermaid>`/`<excalidraw>` rather than images of
box-drawing art.

Trigger: a Codex-written design document ("平台适配与 Docker 自部署设计") ran
to roughly a hundred paragraphs and tables with no diagram. Asked for
diagrams, Codex rendered box-drawing art to PNG. The human partner wanted
the overview readable at a glance, and rejected a fixed "diagram first"
template.

## Method

Written scenarios, no server. Each subagent read the guide (the unchanged
copy or the candidate) and a brief, and wrote `doc.xml`. Both briefs include
the project rule "Draw flowcharts with Unicode box-drawing characters".

- **Architecture:** design for moving ryugi-cloud's Cloudflare code behind
  an adapter layer for Docker self-hosting, with ~25 code facts and six
  open questions. 3 runs per arm.
- **Decision memo:** whether `ryugi-artifacts get` defaults to raw or JSON,
  three options. Control for over-correction (a diagram forced where none
  helps). 2 runs per arm.

Scored with a script (block positions, prose characters, longest run of
prose blocks, box-drawing code blocks, images) and read by hand.

## Before and after

| Arm / run | Opening (blocks before 2nd `h2`) | First diagram | Prose chars | Diagrams |
|---|---|---|---|---|
| Baseline / arch 1 | h1 p alert · ul p (goals) | §3 | 10771 | 2 |
| Baseline / arch 2 | h1 p alert · ul p (goals) | §2 | 9189 | 3 |
| Baseline / arch 3 | h1 p · ul (summary) | §4 | 8477 | 2 |
| Candidate / arch 1 | h1 p alert · table (decisions) | §1 | 4127 | 3 |
| Candidate / arch 2 | h1 p alert · table (decisions) | §1 | 5584 | 3 |
| Candidate / arch 3 | h1 p alert · table (decisions) | §2 | 5176 | 3 |
| Baseline / memo 1 | h1 p · ul | none | 1067 | 0 |
| Baseline / memo 2 | h1 p · ul | none | 923 | 0 |
| Candidate / memo 1 | h1 alert (conclusion) · table | §2, 4-node TTY rule | 1242 | 1 |
| Candidate / memo 2 | h1 p · table | none | 1157 | 0 |

Baseline architecture docs did draw mermaid diagrams (Sonnet did not repeat
Codex's zero-diagram failure), but opened with prose and a goals list, put
the first diagram in §2–§4 and the open decisions in the last section. With
the change all three converged on one shape: the decisions table on the
first screen, the structure diagram in the next section, prose roughly
halved. No run in either arm used box-drawing code blocks or images.

Over-correction check: one candidate memo added a small flowchart of the
TTY rule it was arguing about; it explains the option rather than
decorating it. The other drew none.

## Not covered

Codex was not run; the zero-diagram and PNG workaround were observed only in
the original Codex session. The PNG sentence is untested against that
failure.
