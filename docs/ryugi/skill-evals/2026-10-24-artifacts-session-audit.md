# Skill eval: fixes from an audit of real Codex and OMP sessions

Date: 2026-10-24. Model: Claude Sonnet (Claude Code subagents). Skill at
`ea85fd5`.

## Where the failures came from

Twenty sessions in which agents used the artifacts skill on other projects:
11 in Codex (toby, newsliquid, ryugi, ryugi-cloud) and 9 in OMP (resume,
accounting-ios, newsliquid, ryugi-cloud, ryugi), 2026-10-20 to 2026-10-24.
These were the recurring wastes:

- `warnings.json` was read before and after every change (35 reads in one
  session; the only non-empty one was a stale read). OMP agents slept and
  then read it 25 times and never compared `checkedAt`.
- `start` ran after every file was written, in 8 sessions, so the browser
  never showed the skeleton while the boards streamed in.
- `artboard.md` (435 lines) came back truncated in 5 Codex sessions and was
  cut at 300 lines in OMP, and was then re-read in pieces.
- Board images put in `artboard/<id>/assets/` returned 404 in 2 sessions
  (the server serves only `pages/`), at a cost of 3 to 6 debugging calls.
- `cat selection.json` returned 27k and 38k tokens, almost all `nodes`.
- In Codex, `start; comment list` ran `comment list` six minutes later,
  because a new foreground server does not return.
- `doc.xml` patches failed because the server had rewritten `<strong>` as
  `<b>` and `/>` as ` />`.
- OMP cut `comment list --json` at 768 bytes.
- Links were held back for 2 to 14 minutes while the agent screenshotted
  static boards.
- A verify request got a plain group with no `"verify": true`.

## Change

- New CLI command `check --artifact <type>/<id>` and server route
  `POST /api/agent/<type>/<id>/check`. The server applies any change the
  watcher has not processed yet, waits for a document merge to settle, then
  rewrites and returns `warnings.json`. The change signature now includes
  file names, so a rename refreshes the viewer. The launcher now requires
  1.31.0.
- `SKILL.md`: run `start` before the first file and again only right before a
  message with a link; read each type doc in its own command; Codex `start`
  gets its own call with a 5 s yield; OMP pipes `comment list` and `check`
  through `jq .`; After every change uses `check`; documents, html pages and
  static boards give the link as soon as `check` is clean; a type-table row
  for verify requests.
- `artboard.md`: prototype authoring and declared parameters (old lines
  144–283) moved to `artboard-prototype.md`, leaving 320 lines; board files
  must live under `pages/`; a streaming step 0 to start the server; `jq` for
  `selection.json`; the verify-group trigger; `check` in After every change.
- `document.md`: the server's rewrite of `doc.xml` (indents, ids, `strong`
  to `b`, `em` to `i`, `del` to `s`, ` />`); `check` is the
  validation. This also corrects "any other tag is rejected".
- `html.md`: `check` prints the runtime warnings.

## Method

Written scenario, no server. Three subagents read the unchanged copy and
three read the candidate. Each answered the same 11 questions with the exact
commands it would run (`task.md`): new artboard from first command to link,
confirming an edit is clean, when to run `start` during several edits, where
a board image goes, reading a selection, starting under Codex and then
listing comments, editing a `doc.xml` block written earlier, `comment list`
under OMP, screenshots versus the link, a verify request with an earlier
verify group pending, and which files a static board needs.

## Before and after

| Question | Baseline (3 runs) | Candidate (3 runs) |
|---|---|---|
| 1. `start` before any file | 1/3 (2 wrote `canvas.json` first) | 3/3 |
| 2. Confirm an edit is clean | 0/3: read `checkedAt`, write, re-read (one with `sleep 1`) | 3/3: one `check` |
| 3. `start` only before the link | 3/3 | 3/3 |
| 4. Image under `pages/` | 3/3 | 3/3 |
| 5. Read the selection | 0/3: `cat selection.json` | 3/3: `jq '{selected, more, tweaks}'` |
| 6. Codex: `start` alone, then `comment list` | 3/3 | 3/3, all with the 5 s yield |
| 7. Edit text written as `<strong>` | 0/3: match `<strong>two</strong>` | 3/3: match `<b>two</b>` from a fresh read |
| 8. OMP `comment list` | 0/3 | 3/3: `\| jq .` |
| 9. Screenshot pass versus link, static boards | 0/3: screenshots first | 3/3: link first |
| 10. Verify round over a pending `v1` | 3/3 | 3/3 |
| 11. Lines read for a static artboard | 625 (SKILL 190 + artboard 435) | 533 (213 + 320) |

Questions 3, 4, 6 and 10 already passed on the written scenario. The real
sessions failed on them under conditions the scenario does not recreate (a
long turn of edits, an existing `assets/` habit from documents, a chain
written in a hurry). Their edits are one or two lines each and kept for that
evidence.

## Regression check: playable prototypes

Two candidate runs got "做一个能点的 Today inbox 原型给我玩：卡片可以划掉，再加一个密度参数
compact/comfortable". Both read `SKILL.md`, then `artboard-prototype.md`,
then `artboard.md`, and copied the Today inbox example. Both wrote a valid
`data-ryugi-tweaks` density enum. Neither called the prototype verified
without running it: both listed the PLAY, Parameters, Reset, Replay and
expanded-view checks as still to do, and one said that, with a browser,
the PLAY pass would come before calling it ready.

Six runs per arm on one written scenario do not establish rates for other
models or harnesses.
