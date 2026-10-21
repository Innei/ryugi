# Skill eval: brainstorming in chat or in a document

Date: 2026-10-21. Model: Claude Sonnet (Claude Code subagents). Change:
`skills/brainstorming/SKILL.md` becomes a router ("Pick the Path"). "Your
First Message", the one-question rule and "Play It Back" move unchanged to
the new `chat.md`, which adds "Step Up to the Document". The new
`doc-rounds.md` runs the questions in a document artifact, a round at a time.
"Showing it" says the brainstorming document opens without an offer.

## Method

Each run was a fresh subagent that read the skill directory (the unchanged
copy or the candidate) and the artifacts skill if sent there, then wrote the
tool calls it would make and its next message. No commands ran. All
scenarios share a fictional monorepo (`web`, `api`, `worker`, plus a
separate `acme-mobile` repo), and the human partner writes in Chinese.

- **A, escalate:** "评论区加个 @ 提醒吧"; after two exchanges the partner adds
  mobile push, email, a permission-request flow for people without access,
  and merging notifications.
- **B, doc-first:** "我们要立项：把 worker 的任务队列从轮询数据库改成基于 Redis
  Streams 的事件驱动，api 和 worker 都要改，还要能灰度切换。写个架构设计，我们边写边讨论。"
- **C, stays small (control):** drag-to-reorder todos, web only, one new
  column on the existing table, after two exchanges.

## Before and after

| Reference | A: opened the document | B: opened the document | C: stayed in chat |
|---|---|---|---|
| Baseline | 0/3 | 0/3 | 3/3 |
| V1 | 3/3 | 3/3 | 3/3 |
| V2 | 2/2 | 3/3 | not rerun |

Baseline A runs all called it a project and played it back, then asked one
more chat question. Baseline B runs all sent the skip line and one opening
question in chat.

V1 A runs opened the document directly, put what chat had settled under
Settled, led with a labelled fork (whether the permission flow is in scope,
or what an unpermitted person's notification shows) and sent one line plus
the link. V1 B runs sent the skip line, how to answer and the link. V1 C
runs stayed in chat; one named the "one field from screen to database"
carve-out as the reason.

V1 issues, three of six document runs: questions about what exists now put to
the partner ("acme-mobile 现在有推送吗", "acme 现在用 Redis 吗"); one B
run had three open items; one had the fork second. B run 3 instead made "要不要我先去读代码？"
an item, recommending yes. V2 makes that the rule, makes item 1 the fork,
and fills Settled from the request on a fresh start.

V2: all five runs put the fork first, turned the current-state questions into
a "read the code first" item, and kept to two open items or fewer. One B run
still left Settled empty; it likely started before the Settled wording
changed. One A run's playback still said the code question was "要问你的"
while its item was the read-the-code offer.

## Not covered

Rounds after the first (re-reading `doc.xml`, `comment list`, moving items to
Settled), converging into the written design, and the no-browser fallback
were not exercised. Neither was a real artifacts server or automatic skill
discovery.

## Follow-up: shorter entry

Change: `SKILL.md` opens with "The Flow" (five steps), merges "First: What
Do You Actually Know?" and "Pick the Path" into one table, merges "Show,
don't tell" and "Showing it" into "Showing It", and moves "The Written
Design" and the builder check, unchanged, to `written-design.md`, loaded
from the Size the Work table. HARD-GATE, Handoff, Red Flags and the
conversation principles are unchanged. `SKILL.md` goes from 1736 to 1360
words.

Two new scenarios: **D**, a project worked out in chat, partner says
"没问题，就这样，写吧"; **E**, the partner describes a settings screen
layout ("左边一列分类，右边是那一类的选项").

| Reference | A: document | B: document | C: chat | D: spec + builder check | E: mockup offer alone |
|---|---|---|---|---|---|
| Before (V2 entry) | 2/2 (V2 above) | 3/3 (V2 above) | 3/3 (V1 above) | 2/2 | 2/2 |
| Shorter entry | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 |

D runs on the shorter entry read `written-design.md`, named the spec path,
dispatched the builder check with `builder-check-prompt.md` and told the
partner a reviewer reads it first. B runs filled Settled from the request
and kept the fork first. One B run planned to open the link with the
harness's own Artifact tool, which the artifacts skill already says not to
do.

## Follow-up: Artboard as a design step, fewer questions

Change: "The Flow" gains step 3, designing what they'll see. "Showing It"
becomes "Designing What They'll See": artboard for several visual
questions, `html` for one surface, words for structure, opened without
asking. The new `artboard-rounds.md` runs visual questions in rounds (one
group per question, a recommended board, a sticky with why, "q1 → b" or
the recommendation). Removed: the "skip the questions" line from both
first messages (the opt-out rule moves to "Pick the Path"), the separate
mockup offer, and the handoff question (it now builds inline unless they
say "just code it").

New scenarios: **F**, "别问了，直接做吧，k8s 用的" after one question;
**G**, "看完了，可以，就按这个来" after the spec is handed over; **H**, the
fresh request "给 todo 列表加个标签功能". H was first run from the shared
scenario file, whose earlier agent turns contain the skip line; agents
copied it (2/2). H was rerun from a file holding only H.

| Reference | A | B | C | E: artboard opened | F: stops asking | G: builds without asking | H: one question, no skip line |
|---|---|---|---|---|---|---|---|
| Before | 2/2 | 2/2 | 2/2 | 0/2 (offer sent) | 2/2 | 0/2 (asked) | 0/2 (skip line) |
| V1 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 2/2 | 0/5: no skip line, but two or three questions |
| V2 | | | | | | | 5/5 |

E runs on V1 opened an artboard `settings-page` with the round title note,
the category grouping as the fork group, a recommended board per group and
a sticky with why. Without the skip line the first message filled up with
follow-up questions; "one open question, a single sentence" did not hold
(0/3). V2 states the shape: "one sentence, one question mark. A follow-up
question waits for their answer."

Not covered: artboard rounds after the first, and an artboard item linked
from a document round.
