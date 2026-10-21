---
name: verifying-ui
description: Use when work changes what your human partner sees in a running app — a spec with UI has just been built, or a visible bug (layout, style, wrong state on screen) is about to be fixed — and before telling them it is done or ready
---

# Verifying UI

Your human partner decides whether UI work is right, by looking at what the
running app actually shows next to what they approved. Your own check — a
browser measurement, a passing test, a glance at a screenshot, the project's
own app-checking skill — is not the verdict. The work is done when every
verify group on the page is passed.

**REQUIRED BACKGROUND:** ryugi:artifacts — its `artboard.md` covers image and
video boards, verify groups and reading verdicts.

Work with no visible change skips this skill: logic already proven by tests,
CLI or terminal output, a tweak your human partner watched you make live.

## Before fixing a visible bug

Capture the broken state from the running app now, while you reproduce it.
After the fix there is no honest "before".

## The verify page

1. **Where.** The artboard that holds the approved design gets a page
   `verify` (name "Verify"). No such artboard (a bug, or work that skipped
   brainstorming): a new artboard `verify-<topic>`.
2. **One group per module or per bug**, `"verify": true`, titled with the
   module or bug:
   - Built from a spec: the approved board (a board with the same `file`)
     on the left, a screenshot of the real app on the right. A module with
     interaction also gets a short recording of it. No approved board: the
     screenshot alone, titled with the spec's requirement.
   - A bug: before on the left, after on the right; add a recording when the
     bug is about behaviour.
3. **Evidence is real.** Screenshots and recordings come from the running
   app, with whatever tool this environment has — a project skill that
   drives the app is a fine source. Never an HTML board standing in for
   "actual". Copy files under `pages/verify/`; keep each video under 8MB
   and the artboard under 20MB. Over 20MB the cloud copy stops updating:
   say so and shrink or drop the largest recordings.
4. Set `focus` to the first group, check that `warnings` and `pending` are
   empty, give the link (the cloud link when there is one), say what each
   group shows, and ask them to tell you here when they have decided. End
   your turn; don't poll.

## When verdicts come back

On their next message, run `comment list` and read `groups`.

- `pass`: done for that group. Leave its files alone.
- `reject`: read the reason and any pins on its boards, and fix it inside
  that group:
  - Behaviour or state (wrong content, a disabled control, a broken flow):
    under ryugi:test-driven-development.
  - Look only (layout, spacing, color, type): the rejected screenshot is
    the failing reproduction and the new screenshot is the check.
  - One commit per fix; exploratory work stays uncommitted, as
    ryugi:executing-specs says.
  - Replace the evidence (same file, or add a board to the group), reply on
    the reject thread with what changed and the commit, and leave the
    thread open.
  - The fix changes what a passed group shows: replace that group's
    evidence too — it goes back to pending — and say so in your reply.
- `pending`: waiting on your human partner. Say so; don't call it done.

Your final message is "done" only when every verify group has passed.
Until then it carries the link and what is waiting on whom.

A new round is for new work on the same page — a later spec, another bug —
not for a reject. Put it below the last round with new groups. Passed
groups of earlier rounds drop `"verify": true`; groups that have not
passed keep it.

## Red Flags

| Thought | Reality |
|---------|---------|
| "I measured it in the browser; it's aligned" | Measurements show what you measured. Put the screenshots up. |
| "Tests pass, so the UI matches" | Tests don't see font size, spacing or color. Compare against the approved board. |
| "Screenshots were scratch; delete them" | They are the evidence. They go on the verify page. |
| "No project verify skill, so I verified it myself" | This skill is the verification. |
| "The project's verify skill already checked it" | It made evidence. Put it on the verify page; the verdict is theirs. |
| "They're in a hurry; I'll just say it's fixed" | Before/after takes a minute and is what they show the room. |
| "I'll mock the result in HTML" | A mockup isn't evidence. Capture the real app or say you can't. |
| "Pending means fine" | Pending means nobody has looked. |
