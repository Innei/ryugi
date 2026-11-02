# Skill eval: brainstorming counts the conversation and guesses first

Date: 2026-11-03. Model: Claude Sonnet (Claude Code subagents). Change:
`skills/brainstorming/SKILL.md` and `chat.md` merge into one file. Pick the
Path counts the whole conversation and the project's code as known, adds a
row for "earlier turns settled what and why", splits "something missing"
into "enough to guess" and "too little to guess", and says a plan request
ends at the plan. Talking It Through adds "ask only what changes what gets
built", "guess before you ask", "your calls, marked" and "look before you
ask" (read the project without asking), and drops chat.md's fixed first
message, its one-sentence rule and the 200-300 word playback. A small
change no longer waits for approval: its description goes out with your
calls marked and building starts in the same turn; HARD-GATE covers
projects. Red Flags gain three rows.

Trigger: in a real session the partner asked whether feature flags support
percentage rollout, the agent explained the change and offered a plan, the
partner said "ok", and brainstorming opened with "which flag will you roll
out next, and how should it ramp day by day?", an answer that changes
nothing in the plan.

## Method

Same as `2026-10-21-brainstorming-paths.md`: each run is a fresh subagent
that reads a skills directory (a snapshot of the current skills, or the
candidate), treats `using-ryugi` as loaded, and writes the tool calls it
would make and its next message. The project is a fictional monorepo; the
partner writes in Chinese.

- **F:** the feature-flag conversation above, ending in "ok".
- **C:** "订单列表加个导出 CSV", cold start; the code shows server-side paging
  and 30,000+ orders.
- **W:** "评论输入框改成回车发送吧"; Chinese IME users type in it.
- **T:** "Let's make a react todo list" in an empty directory (the harness
  acceptance test). Control: nothing may be built.
- **B:** the Redis Streams kickoff from the 2026-10-21 eval. Control: opens
  the document.
- **X:** "the save button should be grey when the form is unchanged". Looks
  like style, is behavior. Control: failing test first.
- **S, S2, R:** a style edit, a style edit approved in chat, and moving 14
  util files into `src/lib/*`. These check whether TDD over-applies.

## Before and after

| Scenario | Baseline                                                                                    | Candidate                                                                |
| -------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| F        | 0/2: one asked "which feature, who first", one played back then asked about anonymous users | 2/2 (v2): full plan, three calls marked, stops at the plan               |
| C        | 0/2: read no code, asked about "the last time you exported orders"                          | 2/2: read the table code, guessed, one question (all rows vs page)       |
| W        | 0/1: read no code, asked how newlines should work, waits for approval                       | 3/3: Shift+Enter and IME handling as marked calls, test first, same turn |
| T        | 1/1: open question                                                                          | 1/1: no build; a guess plus one question (throwaway or daily use)        |
| B        | 1/1                                                                                         | 1/1                                                                      |
| X        | 1/1                                                                                         | 1/1                                                                      |

Baseline C and W runs gave the same reason for not reading the code: the
skill says to offer recon and makes the first message one open question.

Candidate v1 F runs passed on the question but both started building; one
said it would not write the plan at all. The partner had asked for a plan.
v2 adds "when what they asked for is a plan or a proposal, not the change
itself, the description is the deliverable: send it and end your turn".
Both v2 F runs stopped at the plan, and a v2 W run still built in the same
turn.

T changed path: v1 took "enough to guess" instead of the open question. It
built nothing, so the acceptance test holds.

## TDD over-application: not reproduced

Baseline S (2/2), S2 (2/2) and R (2/2) wrote no new test. Style runs used
before/after screenshots; R ran the existing tests and typecheck before and
after the move. The TDD skill's "Always: Refactoring" did not push any run
to write tests. No change to `test-driven-development` was made.

Side observation: every style run built a verify artboard and waited for a
verdict, even for a two-line CSS edit.

## Not covered

Turns after the first, a small change whose guess was wrong and the
partner interrupting, doc and artboard rounds, and real skill discovery
were not exercised. All runs are Sonnet; the triggering session was not.
