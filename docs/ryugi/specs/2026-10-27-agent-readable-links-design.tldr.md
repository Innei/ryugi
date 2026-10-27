# Agent-readable Ryugi Cloud links: TL;DR

The full spec, written for the builder: `2026-10-27-agent-readable-links-design.md`

## What gets built

1. **Signpost** in `/a/:id` and `/a/:id/view`: a head meta and hidden body text telling agents to run `npx -y ryugi-artifacts@latest get <link>`.
2. **`ryugi-artifacts get <link-or-id>`**: reads the published copy with this machine's CLI sign-in; no server needed.
3. **Cloud `files` field** on `/api/a/:id`, so artboards and html can be downloaded whole.
4. **Skill section + description trigger** so plugin agents run `get` first.

## What you'll see

1. `curl` a cloud link: the body says which command to run.
2. Paste a link to Claude or Codex: it runs `get` and reads LiteXML, tables and diagrams intact.
3. An artboard link: files land in `~/.cache/ryugi/get/<id>/` and the agent reads them.

## Decisions

| Item                            | Decision                                    | Whose    |
| ------------------------------- | ------------------------------------------- | -------- |
| Signpost in HTML                | yes                                         | yours    |
| Anonymous requests              | no source URL; CLI instruction for everyone | yours    |
| `get` command using CLI sign-in | yes                                         | yours    |
| Types                           | document, artboard, html                    | accepted |
| Output                          | source by default, `--json` wraps           | accepted |
| Document format                 | LiteXML with block ids                      | accepted |
| Comments                        | included, `--no-comments` drops             | accepted |
| Signpost places                 | head meta + hidden body text                | accepted |
| Signpost command                | `npx -y ryugi-artifacts@latest get`         | accepted |
| Skill guidance                  | SKILL.md section                            | accepted |

## Check these (my calls)

- `get` ignores the "no TTY means JSON" rule: only `--json` gives JSON.
- Skill `description` gains a "paste a Ryugi link" trigger; section sits before the Claude Code branch.
- Documents also download referenced images, excalidraw and dynamic files.
- No built-in sign-in: `login-required` tells you to `start` then `publish --login`.
- Reads the published copy, never the live one.

## Time

About half a day: 2–3 hours for `get` and its tests, 1 hour for the cloud signpost and field, 1 hour for the skill change with before/after runs, plus two releases.
