# Skill eval: Claude Code's Artifact tool first, Ryugi for verify

Date: 2026-10-26. Model: Claude Opus 5.5, Claude Code 2.1.310, interactive
sessions on a Max plan (the `Artifact` tool, the `artifact-*` skills, the
`docs` skill and Claude Docs are all present). Change:

- `skills/artifacts/SKILL.md`: with a tool named `Artifact`, pick the Ryugi
  type, then build it with that tool as `claude-artifacts.md` says; verify
  groups stay on the local server. Without it, local first as before.
- `skills/artifacts/claude-artifacts.md` (new): Ryugi type → Artifact
  quickstart intent, and what changes in rounds (rows under title notes,
  links, reading comments and selections).
- `brainstorming/doc-rounds.md`, `artboard-rounds.md`, `written-design.md`:
  read answers and record artifacts "as ryugi:artifacts says" instead of
  naming `doc.xml`, `comment list` and `selection.json`.
- `verifying-ui/SKILL.md`: a design approved on a claude.ai canvas gets a
  new `verify-<topic>` artboard with the canvas link in each group.

## Method

Each run is a fresh interactive `claude` in tmux with
`--plugin-dir <ryugi>`, Superpowers disabled, in a small React + Go
project. A PreToolUse hook records every tool call and denies `Artifact`,
Claude Docs calls and `ryugi-artifacts` commands, so the first decisive
call is observed and nothing is published. One prompt per session:

- A: "Make me an artifact showing three layout options for the TaskNest
  settings page."
- B: "Write up how the TaskNest sync server merges offline edits as a design
  doc I can share with my team for review."
- H: "Redesign the TaskNest settings page. Show me a few layout directions
  to pick from before you build anything."
- W: "I fixed the bug where the TaskNest settings header overlapped the
  tabs on narrow screens. Screenshots from the running app are in
  shots/before.png and shots/after.png. Put them up so I can sign off on
  the fix."

## Before and after

| Prompt | HEAD                                     | Candidate                                                                                                         |
| ------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| A      | 3/3 Ryugi                                | 3/3 `Artifact` (design)                                                                                           |
| B      | 5/8 Ryugi, 3/8 `Artifact` or Claude Docs | 3/3 `Artifact` (document)                                                                                         |
| H      | 3/3 Ryugi (via brainstorming)            | 2/3 `Artifact` (design) via brainstorming; 1/3 asked a chat question first                                        |
| W      | not run                                  | 1/3 Ryugi verify artboard; 2/3 stopped because the fixture PNGs are solid colors, not screenshots; 0/3 `Artifact` |

HEAD's B split is the behavior this change settles: the harness's
instructions pull shared documents toward `Artifact` and Claude Docs while
the old "Local first" line pulled toward Ryugi, so the outcome varied run
to run. Now every type except verify follows the harness when it has the
tool.

Not covered: a full brainstorming round trip on a canvas (comments and
selections read back between rounds), and runs without a claude.ai plan
(no `Artifact` tool), where the local-first path is unchanged from HEAD.
