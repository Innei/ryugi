# Artboards on the phone — TL;DR

Full spec (for the agent): `2026-10-21-mobile-artboard-design.md`

## What gets built

1. **Opens on the question**: on a phone the artboard zooms to the question the agent last pointed at, not the whole page at 8%.
2. **Question bar**: a bar at the bottom shows the current question with ‹ 上一题 / 下一题 ›.
3. **Jump panel**: pull the bar up for every question of the page, grouped by round, newest first; tap one to zoom there.
4. **One board full screen**: tap a board to read it full screen, with ‹ 上一张 / 下一张 › inside the same question.
5. **Touch**: one finger pans, two fingers zoom.

## What you'll see

1. Open an artboard on the phone → the latest question fills the screen, its id at the bottom.
2. Tap 下一题 → the next question; pull the bar up → the list of all rounds and questions.
3. Tap a board → it fills the screen; swipe through its siblings with 上一张 / 下一张; close.
4. Go back to chat and say "q2r4 → a", as today.
5. Same on ryugi.innei.dev.

## Decided

| Topic                                       | Decision                                                            |
| ------------------------------------------- | ------------------------------------------------------------------- |
| Browsing                                    | canvas + jump panel (`q1-b`), details as drawn in `r2-b1` … `r2-b3` |
| HTML pages                                  | no change                                                           |
| Inspector / selecting elements on the phone | hidden                                                              |
| Look                                        | no cards; flat bar and rows                                         |

## Check these (agent's calls, not yours yet)

1. Phone layout at ≤ 640px wide, same as documents.
2. Without an agent focus, it opens on the first question of the newest round; 上一题 / 下一题 follow the jump list (newest round first) and stop at the ends.
3. A round is the title note above a group; boards outside any group still get their own row.
4. The phone top bar is a flat full-width bar (title, page switcher, live dot, zoom, share), replacing the floating toolbar boxes at phone width.
5. Wide (desktop) boards open scaled to the screen width, pinch to zoom; interactive boards play in the full-screen view.
6. On a desktop touch screen, pan/pinch work except on a board while the Select tool is active.
