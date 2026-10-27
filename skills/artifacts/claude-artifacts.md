# Ryugi Types on Claude Code's Artifact Tool

When you have a tool named `Artifact` (Claude Code on a claude.ai plan),
every type except a verify group goes there instead of the local server.
The tool's own instructions say how to create, write and share; this file
says which of its types each Ryugi type becomes and what changes in the
rounds.

| Ryugi type                    | Artifact `quickstart` intent | What it becomes                                           |
| ----------------------------- | ---------------------------- | --------------------------------------------------------- |
| `artboard`                    | `design`                     | a Design canvas: artboards, title notes, stickies, tweaks |
| `document`                    | `document`                   | the document type it names, usually a Claude Doc          |
| `html`                        | `other`                      | one page                                                  |
| `artboard` with verify groups | —                            | stays local: ryugi:verifying-ui                           |

Verify groups carry pass/reject verdicts the Artifact tool has no
equivalent for, so they always run on the local server, as the rest of
SKILL.md says.

## What stays

- Picking the type, the design system before the first frame, real copy
  and data: SKILL.md's Pick the type and Creative work.
- Rounds as brainstorming lays them out: a group of options per question,
  the recommended one marked, earlier rounds kept as history.

## What changes

- **Groups on a canvas.** One row of artboards per group under a `title1`
  note with the question; "recommended" in that artboard's title; the why
  in a sticky beside the row. A new round is new rows below the last.
- **Same topic, same artifact.** Keep its `url` and change it in place; a
  new topic gets a new artifact.
- **The link** is the one the tool returns. It is private until they share
  it from the page; no `start`, `publish` or Ryugi Cloud.
- **Reading answers.** Comments: `ArtifactComments` (a Claude Doc: its own
  connector). What they selected on a canvas: the type's `view-state.md`.
  No `comment list`, `selection.json` or `check`.
- **The written design** records each artifact by its link and what was
  decided there.
