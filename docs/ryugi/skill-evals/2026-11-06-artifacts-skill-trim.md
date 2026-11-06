# Artifacts skill: trim SKILL.md, server-assigned block ids

Date: 2026-11-06. Model: Claude Sonnet (Claude Code subagents). Change:

- `SKILL.md` 279 → 237 lines. "Reading evidence with the CLI" shrinks to
  the Brief rule, run printed `Read`/`More`/`Acknowledge` as printed, ack
  only after using all delivered evidence, exit codes, and JSON only for a
  parser; per-section comment rules stay in each type's guide, which
  already carried them. The "Use this app for every artifact" rule moves
  from under "Read a Ryugi Cloud link" to the introduction. Dropped: the
  per-type restatements under Creative work (except html's both themes and
  touched states, which no other guide says), the `data-ryugi-tweaks`
  paragraph the type table already routes to, the artboard browser-open
  timing (in `artboard.md`), Brief/TTY and JSONL notes, `.state/` internals.
  The description's trailing fragment becomes "including during
  brainstorming."
- `document.md`: "Write new blocks without an `id`; the server assigns one."

Trigger: 3 of 16 documents in ryugi-cloud carry agent-written block ids
(`title`, `scope`, `p1`, `h1`) instead of server ids. The old text said
only that the server adds ids to blocks written without one.

## Method

Written scenarios, no server. Each run read one guide copy (A: `HEAD`, B:
candidate) from a temp directory and answered or wrote files.

- **CLI:** comments + answered/draft asks, a very large human diff, a
  verbatim section from a Cloud link, a CI script extracting the publish URL,
  a reply arriving after ack.
- **Start:** a tunable button demo with the harness offering its own
  `Artifact` tool, an artboard with per-board parameters and when the browser
  opens, a container behind `devbox.lan`, a public share while signed out,
  phone viewing with auto-publish on.
- **Doc:** a new design doc's first save, and an edit adding a section to a
  server-saved doc with ids.

## Results

| Check                                         | A   | B   |
| --------------------------------------------- | --- | --- |
| Brief by default, printed commands as printed | yes | yes |
| Ack only after reading all delivered evidence | yes | yes |
| Large diff via `--save NEW_FILE`, full read   | yes | yes |
| Apply only `submitted` asks, note each        | yes | yes |
| JSON + `.data.url` only for the CI parser     | yes | yes |
| Later reply stays unread, new receipt         | yes | yes |
| Tunable component → `html`, reads ui.md       | yes | yes |
| Uses the app, not the harness `Artifact` tool | yes | yes |
| html shows both themes                        | yes | yes |
| Parameters → reads artboard-prototype.md      | yes | yes |
| Browser opens when the focus group is ready   | yes | yes |
| `--host 0.0.0.0 --url-host`, keyed URL        | yes | yes |
| Signed out → login link, retry `--public`     | yes | yes |
| Phone: `Open` URL, no `publish`               | yes | yes |
| New blocks written without ids                | yes | yes |
| Existing ids kept on edit                     | yes | yes |

No regression on any check. B stated the harness-tool rule explicitly; A
followed it without naming it. Sonnet A also wrote no block ids, so this
run does not reproduce the hand-written-id failure; the `document.md`
sentence is a clarification, not a measured fix.

## Type selection

The trim removed the per-type restatements under Creative work, so type
choice ran separately: 14 requests, each answered with a type (and choice or
verify group for an artboard) or a text reply, on Sonnet and Haiku.

| Request                                        | Expected         | A Sonnet | B Sonnet | A Haiku | B Haiku |
| ---------------------------------------------- | ---------------- | -------- | -------- | ------- | ------- |
| Design doc for team review                     | document         | ✓        | ✓        | ✓       | ✓       |
| Billing modules, who calls whom, draw together | whiteboard       | ✓        | ✓        | ✓       | ✓       |
| Explain existing relay architecture            | document         | ✓        | ✓        | ✓       | ✓       |
| Tune hero gradient and noise                   | html             | ✓        | ✓        | ✓       | ✓       |
| Settings: nav, empty state, mobile options     | artboard, choice | ✓        | ✓        | ✓       | ✓       |
| Check built toolbar against approval           | artboard, verify | ✓        | ✓        | ✓       | ✓       |
| Change the lint script                         | text             | ✓        | ✓        | ✓       | ✓       |
| Toast motion with duration and easing          | html             | ✓        | ✓        | ✓       | ✓       |
| Split auth together, from existing code        | whiteboard       | ✓        | ✓        | ✓       | ✓       |
| Three onboarding flows, four screens each      | artboard, choice | ✓        | ✓        | ✓       | ✓       |
| Performance results report with numbers        | document         | ✓        | ✓        | ✓       | ✓       |
| Checkout flow alternatives to pick from        | artboard, choice | ✓        | ✓        | ✓       | ✓       |
| Postgres vs SQLite, briefly                    | text             | ✓        | ✓        | ✓       | ✓       |
| An HTML page of every button size and state    | html             | ✓        | ✓        | ✓       | ✓       |

56 of 56. The type table and the whiteboard/document and html/artboard rules
it kept carry the choice on their own.

## Not covered

One run per cell; Sonnet only outside type selection. No live server or browser. The three
documents with agent ids were written by other sessions whose model is
unknown.
