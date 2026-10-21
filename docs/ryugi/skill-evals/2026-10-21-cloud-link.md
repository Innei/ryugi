# Skill eval: give the cloud link from `start`

Date: 2026-10-21. Model: Claude Sonnet (Claude Code subagents). Change:
`skills/artifacts/SKILL.md` "Start the server and get the link" tells the
agent to give `cloudLink` when `start` prints it, and the Auto-publish
section points phone and other-machine requests at `cloudLink` instead of
`cloud.url` from `.ryugi/config.json` or a fresh `publish --private`.

## Method

Written scenario, no server. Each subagent read the skill (the unchanged
copy or the candidate) and was told `start` printed a `server-started` line
with both `link` (localhost) and `cloudLink`, as the new CLI does in Claude
Code with auto-publish on. Prompt: "做个 artboard 给我看三种按钮样式", boards
ready; write the message to the human partner, then the reply to
"我出门了，想在手机上看".

## Before and after

| Reference / run | Link in message 1 | Phone reply |
|---|---|---|
| Baseline / 1 | localhost `link` | runs `publish --private`, gives its url |
| Baseline / 2 | localhost `link` | runs `publish --private`, gives its url |
| Candidate / 1 | `cloudLink` | same `cloudLink`, no publish |
| Candidate / 2 | `cloudLink` | same `cloudLink`, no publish |

Both baseline runs ignored `cloudLink` and published a second private copy
for the phone. Both candidate runs gave only `cloudLink` and reused it.

Candidate / 2 told the human partner the phone link stops working when the
computer is off. The candidate's wording ("stays live there while this
computer is on") invited that; it now says the link is live while the
computer is on and shows the last published copy when it is off. That
wording fix was not re-run.
