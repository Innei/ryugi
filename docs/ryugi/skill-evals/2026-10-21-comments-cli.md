# Skill eval: answer comments through the CLI

Date: 2026-10-21. Model: Claude Sonnet (Claude Code subagents). Change:
`skills/artifacts/document.md` "Comments" moves from editing `comments.json`
to the `ryugi-artifacts comment` commands; the file table and `SKILL.md`
tree say `comments.json` is server-only.

## Method

Each run got a fresh disposable project with a real artifacts server built
from this branch, started with a Codex environment (`CODEX_THREAD_ID`) so a
name taken from the server's starter is visibly wrong. The subagent itself
runs under Claude Code. The document `rollout` held two human threads
created through the browser API: "1% 太少了，改成 2%，正文也一起改。" on
the steps paragraph, and "这个阈值是怎么定的？有数据吗？" on the rollback
paragraph. Prompt: read the skill (`SKILL.md` + `document.md`, either the
unchanged copy or the candidate), then "我在 rollout 文档里留了评论，处理一下。"
The hook run instead attached the hook's reminder line and the message
"继续". Results were read from `comments.json`, `doc.xml` and
`comment-cursors.json` after each run.

## Before and after

| Reference / run | How comments were written | Agent name on replies | 1%→2% in doc | Change thread | Question thread | Read cursor |
|---|---|---|---|---|---|---|
| Baseline / 1 | python appends to `comments.json` | Codex (wrong) | yes | resolved | replied, open | none |
| Baseline / 2 | python appends to `comments.json` | Codex (wrong) | yes | resolved | replied, open | none |
| V1 / 1 | `comment list`, `comment reply` | Claude Code | yes | replied, **open** | replied, open | set |
| V1 / 2 | `comment list`, `comment reply` | Claude Code | yes | replied, **open** | replied, open | set |
| V1 / hook reminder | ran the reminder's `comment list`, then `reply` | Claude Code | yes | replied, **open** | replied, open | set |
| V2 / 1 | `comment list`, `reply`, `resolve` | Claude Code | yes | resolved | replied, open | set |
| V2 / 2 | `comment list`, `reply`, `resolve` | Claude Code | yes | resolved | replied, open | set |

Baseline agents followed the old reference exactly: they wrote the JSON
file, and the server stamped their replies with the agent that started it.

V1 put "Settled: `comment resolve`" as the last bullet and said "edit
`doc.xml` first, then reply" for change requests. All three V1 runs left the
fulfilled change thread open, one saying it was waiting for confirmation;
both baseline runs had resolved it. V2 says "edit `doc.xml`, reply with what
changed, then resolve the thread", which restored the baseline behavior.
The hook-reminder run used V1; the resolve wording does not affect whether
the reminder's command is run.

No run read or wrote `comments.json` under V1 or V2.
