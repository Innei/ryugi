---
name: verifying
description: Use before telling your human partner that work is done, fixed, live or ready, whatever it touched — UI, an API, a CLI, data, a deploy, performance — and before fixing a bug they can see, to capture it first
---

# Verifying

A claim is proved where it is about, by you, before you make it. Whatever a
command can decide, you decide and show. Your human partner is asked only
for what needs a person: how something looks, moves, feels, sounds or
reads, and whether a trade-off is right.

**REQUIRED BACKGROUND:** ryugi:artifacts — its `verify.md` covers verify
reports (claims, output, gaps), and its `artboard.md` covers verify groups
for screens; both cover `from`, `capturedAt` and reading verdicts.

## How much verification

Two things decide it: does a person have to judge something a reply cannot
show, and does the proof fit in a reply. Who reported the work does not.

| The work                                                                                                                           | What you do                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| One claim a line or two of output proves, nothing for a person to judge (an off-by-one, a failing command)                         | Prove it inline: the command, its output, where it ran. No page.                   |
| One small visible change (a padding, a colour), reported bug or not                                                                | Prove it inline, with the before and after screenshot paths in the reply. No page. |
| Several claims, a proof that is a run of several steps or flows, work built from a spec, or a judgement about motion, feel, a flow | A verify report, an artboard verify page, or both: see Where the evidence goes.    |
| They say skip it                                                                                                                   | Skip it, and say what was not verified.                                            |

A fix proved by driving a flow end to end (sync between two clients, an
import, a deploy and what it serves) is a run of several steps: its log goes
in a verify report, where it can be kept and linked, not into the reply.
When a small row and the last row still both seem to fit, the small row
wins.

## Before fixing a visible bug

Capture the broken state from the running app now, while you reproduce it.
After the fix there is no honest "before".

## Your proof

This part always runs, at every size.

1. **The claim sets the place.** "Fixed" is proved where the bug was seen.
   "Live" is proved on the deployed thing, after the deploy carrying the
   change has finished and you have confirmed which build is running. A
   library change is proved in something that consumes the built package.
   A feature behind a flag is proved with the flag on. A check somewhere
   nearer and easier — unit tests, a mock, a local build, a simulator, your
   own dev server — is supporting evidence. Label it as that; it never
   upgrades the claim.
2. **Run the whole chain** as a user or caller would, with real data and
   real sign-in where the project allows it. Before the first run, read how
   the project says to verify (its agent instructions, acceptance or
   verification docs, its own skill for driving the app) and use its
   commands and fixtures over your own habits.
3. **Say where evidence came from**: environment, build or commit, and
   time. Evidence captured before the last change to the code it covers is
   stale. Capture it again.
4. **Walk the neighbours.** Once the change is proved, exercise the other
   flows that share what you touched — the same screen, component,
   endpoint, table or command — in the running thing, and say which ones
   you walked. Stop at what the diff touched.
5. **A check you state is a check you ran**, in this session, with its
   command and output: "typecheck clean" and "N tests pass" included.

**No homework.** Your final message never ends with a check for your human
partner to run. Verify it before you report, or list it under "Not
verified" with why you cannot do it and the one thing you need from them.

**Never ask permission to verify.** Running the checks needs no approval.
Destructive and outward-facing actions keep their usual confirmation.

**When only they can act** — fold a device, unlock it, a passkey, an
account you have no access to — first try the tools this environment has.
If none can do it, ask once: one numbered list of the exact actions, with
what to reply after each. Do everything around those actions yourself.

## Where the evidence goes

Ask of each claim: is it judged by looking at a screen, or by reading output
and numbers?

| The work has       | You make                                                                           |
| ------------------ | ---------------------------------------------------------------------------------- |
| Only output claims | A verify report. No artboard.                                                      |
| Only screen claims | The artboard verify page. No report; "Not verified" goes in your final message.    |
| Both               | Both. The report lists the artboard's verify groups as rows; give the report link. |

Work whose whole question is how a screen looks, moves or feels has only
screen claims. What you measured or ran to back them — pixel sizes, sampled
frames, the test suite, a typecheck — is your proof of those same claims,
not a second kind: put it in the group's sticky or your final message. An
output claim is one that would still need proving if nobody looked at a
screen: an API result, data, a deploy, a number against a threshold.

## The verify report

For what is judged by reading: the log of an end-to-end run, API status,
counts, a migration result, which build is deployed and what it serves, a
number against a threshold, a downstream build, an eval tally. Write it as
`verify.md` says. One report per piece of work, `verify/<topic>`. Write it
in their language: titles, asks, gaps and notes. Ids, commands and output
stay as they are.

1. **One claim per thing you assert**, titled with the claim, each with
   `from` and `capturedAt`.
   - **A command decided it**: `judge="agent"`, with the command's raw
     output as an `<output>` file. Nothing waits on it. A check that failed
     never goes here: fix it first.
   - **This work left a judgement open, and it is not about a screen** (a
     threshold you picked, a trade-off you made, whether a sample is
     enough): `judge="human"` with an `<ask>` saying what would make it
     wrong. Most reports have none: never re-ask what the spec or the bug
     report already decided.
2. **Every item under "Not verified" is a `<gap>`**: what, why you could
   not, and the one thing you need. An empty gaps section is part of done.
3. **Screen claims are rows**: `<ref artboard="…" group="…" />` for each
   verify group on the artboard, so the report shows their verdicts too.
4. Run `check`, clear its warnings and provenance notes, give the link, say
   how many claims need them and how many you checked, and ask them to tell
   you here when they have decided. End your turn; don't poll. While you
   wait you may start the next unrelated task; landing this work waits for
   the verdicts.

## The verify page on the artboard

For what is judged by looking: a built screen beside its prototype, a
visible bug before and after, motion, device screenshots.

1. **Where.** The artboard that holds the approved design gets a page
   `verify` (name "Verify"). No such artboard (a bug, work that skipped
   brainstorming, a design approved outside this project): a new artboard
   `verify-<topic>`, with the design's link in each group's sticky when
   there is one.
2. **One group per module or per bug**, `"verify": true`, with `from` and
   `capturedAt`. The title or a sticky says what you are asking, in their
   language: what to look at, and what would make it wrong.
   - Built from a spec: the approved board (a board with the same `file`)
     on the left, a screenshot of the real app on the right. A module with
     interaction also gets a short recording. No approved board: the
     screenshot alone, titled with the spec's requirement.
   - A bug: before on the left, after on the right; add a recording when
     the bug is about behaviour.
   - Motion, frame rate, how a gesture feels: also give the running thing
     itself — a link, or the exact command that opens it. A recording alone
     does not carry those.
3. **Evidence is real.** Screenshots and recordings come from the running
   thing, with whatever tool this environment has — a project skill that
   drives the app is a fine source. Never an HTML board standing in for
   "actual". Copy evidence under `pages/verify/`; keep each file under 8MB
   and the artboard under 20MB. Over 20MB the cloud copy stops updating:
   say so and shrink or drop the largest recordings.
4. **Link back.** When the spec lists the document where this was
   discussed and it still exists, add `<ref artboard="<id>" group="<verify
group>" />` to the section that discussed each module, as ryugi:artifacts
   says under References in document.md. The reference shows the verdict,
   and it is the only way back from the verify page to that discussion.
5. Set `focus` to the first group, run `check` and clear its warnings,
   provenance notes and `pending`, give the link (the report's link when
   there is a report; else the artboard's, the cloud link when there is
   one), say what each group asks, and ask them to tell you here when they
   have decided. End your turn; don't poll.

## Running the checks

Each check has one output location. A retry or rerun writes over the
previous result; never create numbered copies (`-1`, `-2`, `-final`) of
the same check. Keep two runs side by side only when the point is comparing
two builds, and name them for the builds. Delete scratch output you created
once the evidence you need is copied to the verify page.

## Prepare each recording

Add the original recording normally; Artifacts prepares Verify videos
automatically. Replay the video on the Verify page: every action, loading
or error state, and final result must remain visible. When original timing
or narration is itself evidence (performance, timeouts), set `"trim": false`
on that video board.

## When verdicts come back

**They said it in chat.** "All pass", "pass, release it", "reject the header
one, it still doubles", "skip the production one": record it first, on the
artifact it belongs to — `comment pass … --all`, `comment pass … --group
<id>` or `--claim <id>`, `comment reject … --text <their reason>`, `comment
waive … --gap <id>` — then do the rest of what they asked. The pages have
to match what they said.

**They said ship and nothing about passing.** "Push", "PR", "release it"
while groups or claims are pending is not a verdict. Do what they asked,
record no pass, leave them pending, and say in one line which went out
without a verdict.

**They decided on the page.** On their next message, read both. The
report: `comment list --artifact verify/<id>`. The artboard: use the
artifacts launcher to read `comment list --sections groups,threads --detail`
for this project and artboard in Brief. Inspect groups with `kind=verify`. Follow
each collection's printed `More`; the delivered thread page includes
complete messages. Use the evidence before its exact `Acknowledge`. Verify
groups use the human's `verdict`, independently of choice-round submission.

- `pass`: done for that group. Leave its files alone.
- `checked by agent` (reports): yours, settled. Nothing to do unless they
  reject it.
- `reject`: read the reason and any pins on its boards, and fix it inside
  that group:
  - Behaviour or state (wrong content, a disabled control, a broken flow,
    a wrong result): under ryugi:test-driven-development.
  - Look only (layout, spacing, color, type): the rejected screenshot is
    the failing reproduction and the new screenshot is the check.
  - One commit per fix; exploratory work stays uncommitted, as
    ryugi:executing-specs says.
  - Replace the evidence (same file, or add a board to the group), update
    `from` and `capturedAt`, reply on the reject thread with what changed
    and the commit, and leave the thread open.
  - The fix changes what a passed group shows: replace that group's
    evidence too — it goes back to pending — and say so in your reply.
  - A rejected claim that was `judge="agent"` now waits on their pass like
    any other. Your new evidence does not settle it.
- `pending`: waiting on your human partner. Say so; don't call it done.

**Done** means: your proof is complete, every gap is gone or waived, and
every claim and group that waits on them has passed. Until
then your final message carries the link and what is waiting on whom.

A new round is for new work on the same page — a later spec, another bug —
not for a reject. Put it below the last round with new groups. Passed
groups of earlier rounds drop `"verify": true`; groups that have not
passed keep it.

## Red Flags

| Thought                                                 | Reality                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| "Tests pass, so it works"                               | Tests ran against a stand-in. Run the chain where the claim is about.                   |
| "It works locally, so it's live"                        | Live is the deployed build. Confirm which build is running, then exercise it.           |
| "Next: open X and check Y"                              | That is your check. Run it, or list it under "Not verified" with why you can't.         |
| "Shall I run the acceptance check?"                     | Run it. Verifying needs no permission.                                                  |
| "I'll ask them to tap, then ask for the next step"      | One numbered list of every physical action, once. Everything else is yours.             |
| "It isn't visible, so this skill doesn't apply"         | Output is evidence. A verify report: `judge="agent"`, the output file, where it ran.    |
| "It looks right to me; I'll mark it checked"            | Look, motion and feel are theirs, on the artboard. `"verify": true`, with the question. |
| "I'll put the log on the artboard next to the screens"  | The artboard is for screens. Output goes in the report; the report lists the groups.    |
| "They said push, so they passed it"                     | Push. Record nothing. Say which groups went out without a verdict.                      |
| "They said all pass in chat; the page can stay pending" | Record it first. A page that disagrees with them is wrong evidence.                     |
| "A verify page, to be thorough" (for a one-line change) | One claim, nothing to judge: the command and its output, inline.                        |
| "I measured it in the browser; it's aligned"            | Measurements show what you measured. Put the screenshots up.                            |
| "Tests pass, so the UI matches"                         | Tests don't see font size, spacing or color. Compare against the approved board.        |
| "Screenshots were scratch; delete them"                 | They are the evidence. They go on the verify page.                                      |
| "The project's verify skill already checked it"         | It made evidence. What needs a person still goes to the page; the verdict is theirs.    |
| "I'll mock the result in HTML"                          | A mockup isn't evidence. Capture the real thing or say you can't.                       |
| "That screenshot is from before my last edit"           | Stale. Capture it again and update `capturedAt`.                                        |
| "Pending means fine"                                    | Pending means nobody has looked.                                                        |
