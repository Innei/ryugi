# Simulated-session micro-tests (Sonnet subagents, read-only, bootstrap read from the hook's exact output)

| Arm                                                    | todo: artboard, 2-3 purpose directions, no code                                   | style-small: edit, no choice artboard, no question                                              | cli-build: no artboard                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| baseline (984c6891)                                    | 0/5 (all: guess + one "what is it for" question; 3/5 said it "stays in words")    | 3/3                                                                                             | 3/3                                       |
| bs-only (frozen using-ryugi + candidate brainstorming) | 5/5 (quick list / daily planner / shared list, start + canvas + 3 boards + check) | 3/3                                                                                             | 3/3 (2 guess + question, 1 open question) |
| candidate (both skills from the working tree), Sonnet  | 5/5                                                                               | 3/3                                                                                             | 3/3                                       |
| candidate, Haiku                                       | 5/5                                                                               | 3/3 (all three open a verifying-ui verify group with before/after screenshots; no choice group) | —                                         |

Candidate extra cases (Sonnet): habit tracker 3/3 artboard with its own purpose directions (daily checklist / streaks and heatmap / shared with friends); bug 3/3 systematic-debugging then TDD red/green; direct 3/3 TDD, no questions; question 3/3 no tool calls. Haiku direct 3/3 TDD, no questions.
Haiku simulations broke the read-only rule with one `ls`/`find` in 5 of 11 runs (no writes).
Candidate injected context: 2,139 chars (full 4,692, short 1,174); linear token estimate +817 over absent, to be measured natively.
