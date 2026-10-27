# Skill eval: read a pasted Ryugi Cloud link with `get`

Date: 2026-10-27. Model: Claude Sonnet (Claude Code subagents). Change:
`skills/artifacts/SKILL.md` gains "Read a Ryugi Cloud link" before the
`Artifact` tool branch (run `node app/ryugi-artifacts.cjs get --json <link>`
first; no page fetch, browser or `Artifact` tool), and its `description`
gains "or when they paste a Ryugi Cloud link (…/a/…) to read".

## Method

Written scenario, no commands run. A Claude Code agent with Bash, WebFetch,
the `Artifact` tool and five skills (ryugi:brainstorming,
ryugi:systematic-debugging, ryugi:artifacts, agent-browser,
claude-in-chrome) receives exactly "读下 https://ryugi.innei.dev/a/paOMLK_jHrmmMcyUNhLR".
Each subagent first read only the artifacts skill's frontmatter (the unchanged
copy or the candidate) to choose a skill, read the whole file only if it
chose that skill, and named its first two tool calls.

## Before and after

| Reference / run | Skill loaded    | First call                      | Fallback                                       |
| --------------- | --------------- | ------------------------------- | ---------------------------------------------- |
| Baseline / 1    | none            | WebFetch the link               | guess `/raw`, then ask                         |
| Baseline / 2    | ryugi:artifacts | WebFetch the link               | agent-browser on the rendered page             |
| Baseline / 3    | none            | WebFetch the link               | curl, then ask                                 |
| Candidate / 1   | ryugi:artifacts | `get --json <link>`             | read `dir` files, or quote `message` on exit 2 |
| Candidate / 2   | ryugi:artifacts | Skill, then `get --json <link>` | —                                              |
| Candidate / 3   | ryugi:artifacts | Skill, then `get --json <link>` | —                                              |

Baseline runs said the description covers making and sharing artifacts, not
reading one, and that the body has no read command; the one that loaded the
skill still fell back to fetching and a browser. Every candidate run loaded
the skill from the new trigger and made `get` its first command.

## Not covered

Codex and other harnesses were not run. The scenario names the skill list;
a harness with many more skills could still route a bare link elsewhere.
