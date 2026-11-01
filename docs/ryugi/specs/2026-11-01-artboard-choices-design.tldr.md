# TL;DR: Artboard choices

Spec: `2026-11-01-artboard-choices-design.md`.

## What gets built

Question groups can be answered on the artboard: pick one board per group,
comment if you like, then submit the round. With a comment monitor, submit
wakes the agent; without one, say "done" in the terminal.

## What you'll see

1. Each board label starts with a radio; the recommended board has a
   "Recommended" tag.
2. Click a radio: the board gets an orange outline. Another board in the
   group switches the pick; the chosen one again clears it.
3. A dark bar at the bottom: "Round 1 · 2/4 chosen · 3 comments · q3, q4 by
   recommendation [Submit]".
4. After submit the round locks: "Submitted 16:04 · Claude is drawing round 2
   · Withdraw", or "Submitted · Say done in the terminal · Withdraw".
5. On the phone, a full-screen board has "Choose this" at the bottom; the
   sheet's title row says "chose b".
6. Long titles wrap to two lines, actions stay top right, ⋯ when narrow.

## Decisions

| Decision                | Answer                                        |
| ----------------------- | --------------------------------------------- |
| Where to pick (desktop) | radio in the label row                        |
| Where to submit         | bottom bar                                    |
| Long titles             | two lines, actions top right                  |
| Where to pick (phone)   | bottom of the full-screen board               |
| Unpicked groups         | take the recommendation                       |
| After submit            | locked; withdraw until the next round appears |

## Check these

- Terminal answers (`q1 → b`, or "done" without submit) are written to the
  board and submitted by the agent.
- A round closes when the next round appears, submitted or not.
- The board label rewrite applies to every board, not only choice groups.

## Time

About 6–8 hours of agent work, tests, skill evals and release included.
