# TL;DR: verifying

**What gets built:** `verifying-ui` becomes `verifying`, a skill for every
"done" claim. The agent proves what a program can prove, in the real
environment; you only judge what needs a person. Artboards gain collapsed
agent-checked groups, text boards for command output, and a "from" line.

**Why:** one month of sessions, 1072 cases. Two thirds were outside UI. The
repeating problems were proxy evidence, checks handed to you as homework,
you acting as my hands, verdict clicking that cost too much, and breakage
after a pass.

## What you'll see

1. A sync or API fix → a verify page whose groups are collapsed "checked by agent", each with the raw output and where it ran. Nothing waits on you.
2. A UI spec built → only look, motion and feel sit open, each with a stated question. Mechanical claims are collapsed.
3. A padding fix → no page. Command or before/after screenshots in the reply.
4. You type "all pass, push" → I record the passes on the page, then push.
5. My final message never ends with "next: you open X". Unverified items are listed with why I could not do them.

## Decisions

| Decision                    | Choice                                           | By   |
| --------------------------- | ------------------------------------------------ | ---- |
| Shape                       | one skill, two layers (agent proves / you judge) | you  |
| Program-proved items        | on the page, collapsed                           | you  |
| Old name `verifying-ui`     | removed, no alias                                | mine |
| Non-visual evidence         | new `text` board showing the captured file as-is | mine |
| Freshness                   | `from` + `capturedAt` on every verify group      | mine |
| Exploratory QA / dogfooding | not in this; a later skill                       | mine |

## Check these (my calls)

- **Bare "push" with groups pending** is not a pass: I push, leave them pending, and say which shipped unjudged.
- **Page or no page** is decided by "is there a judgement call" and "are there several claims", not by who reported it. Small wins on a tie.
- **You reject a collapsed group** → it becomes a normal group that only you can pass. My new evidence never re-settles it.
- **Regression walk** is bounded to flows sharing the changed screen, endpoint or command. Not a full pass.
- **Waiting on your verdict** does not stop me starting the next unrelated task; landing still waits.
- **Reject keeps its reason.** Your "why must I write a reason" complaint is left out.
- **Eval bar:** no-page, chat-verdict, bare-push and no-homework scenarios 5/5; the rest at least 4/5; Sonnet + Haiku.
- **Your uncommitted whiteboard-font work** in ryugi-cloud stays untouched; this is built in a worktree.

## Time

About 2 working days: artifacts changes 1 day, skill text and references half a day, evals half a day. Add half a day if the eval needs a second round.
