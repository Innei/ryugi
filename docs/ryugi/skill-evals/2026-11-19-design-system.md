# Skill eval: design-system

Date: 2026-11-19. Model: `deepseek/deepseek-flash`, thinking `auto` (resolved `high`). Harness: OMP CLI 18.22.2, `--auto-approve --mode json --print --max-time 15m`, installed skills linked to this checkout. Spec: `docs/ryugi/specs/2026-11-19-design-system-skill-design.md`.

## Method

Each run copies a fixture into a fresh git repository. Turn 1 is the task prompt; every later turn is `按推荐，继续` (go with the recommendation, continue), the reply a partner gives without reading. S0 runs one turn, S1–S3 two, S4 and S5 three (layout is step 3). After each turn the repository's `git status` is recorded; anything outside `.ryugi/` is a product change. Skills read, artboard structure (pages, groups, choice groups, title notes) and the final message are read from the JSONL and `canvas.json`; criteria needing judgment were read from the board HTML.

| Case | Fixture                                                                                                                                          | Prompt                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| S0   | empty directory                                                                                                                                  | Let's make a react todo list                                                                                           |
| S1   | Vite + React ledger app (小账), no styles, no tokens                                                                                             | 给这个记账 app 做设置、账户、预算三块页面，用 artboard 出方案。别问我问题，直接画。                                    |
| S2   | haklex at `180a94af^` (before Quiet Ink)                                                                                                         | 帮这个编辑器建立一套 design system，用 artboard。别问我问题，直接画。                                                  |
| S3   | S1 plus untouched shadcn/ui init                                                                                                                 | same as S1                                                                                                             |
| S4   | S1's app with three finished pages and components; every style value a literal, with planted near-duplicates (`#72685c` / `#746a5e` / `#6f665a`) | 这个 app 的页面和组件基本都做完了，但没有 design token……帮它把 design system 建起来，用 artboard。别问我问题，直接画。 |
| S5   | README and `docs/product.md` only (摘页: pages, navigation, flows, data, tone)                                                                   | 这个项目还没开始写，产品文档在 docs/product.md。先把 design system 定下来，用 artboard。别问我问题，直接画。           |

S2's spec-named defects were already fixed in that snapshot; it was scored on three present ones: four light tokens sharing `#f5f5f5`, `textQuaternary` at 2.5:1 in both themes, and 125 raw hex values in 19 style files outside the token package.

The six baseline runs shared the partner's machine artifacts server and could reach Ryugi Cloud; one of them published its artboard publicly (taken down). Runs up to candidate 3 ran on the host with their own server home, ports and an unreachable Cloud origin. From candidate 4 on, every run ran in a throwaway container per `.claude/skills/isolated-agent-eval/` (image `ryugi-agent-eval`, OMP 18.22.2), writable only to its own output directory, with no Cloud sign-in. A first host batch of candidate 4 was stopped and discarded when the partner asked for containers.

Product changes are counted from `git status` and, from candidate 4 on, from commits after the fixture: rechecked that way, candidate 1's S1-1 and candidate 2's S3-1 had also committed the code they wrote (already scored as failures).

## Baseline (skills at `35bd79cb`, no design-system skill)

| Run   | Turn 1                                                                                                                                 | Turn 2                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| S0    | three use directions in a choice group, no code — pass                                                                                 | —                                                                                                                     |
| S1 ×2 | finished screens in one silent style, no choice group                                                                                  | built the app without a spec (23 and 17 product files)                                                                |
| S2 ×2 | the existing tokens laid out as a catalog (10 and 16 boards), no audit, no choice; one noticed 2.5:1 and relabelled it "non-text only" | one published the artboard publicly to Cloud (taken down); one wrote `docs/design-system.md` from the existing tokens |
| S3    | finished screens, one style; shadcn defaults read as "the design system"                                                               | built the pages and committed twice                                                                                   |

Rationalizations, verbatim from thinking: "user explicitly says don't ask questions, just draw"; "No questions. Need to pick direction. Existing app has no design system; just simple."; "I could give one strong direction and note decisions"; "rich-style-token. This is the design system basis."; "'按推荐，继续' … But I didn't present recommendations/choices … The natural next step is build the pages."

## Candidate 1 (`c3e5dffc`)

| Case      | Result                                                                                                                                                                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0        | pass                                                                                                                                                                                                            |
| S2 ×2     | **pass 2/2**: loaded the skill; first board an audit that found all three defects; a three-system choice group; one foundations group per dimension, each with a baseline board; no product change in two turns |
| S1 ×2, S3 | **fail**: never loaded the skill (read only artifacts and interface-craft), repeated the baseline                                                                                                               |

Cause: these prompts route through ryugi:artifacts, not brainstorming, and `artifacts/SKILL.md` told agents without a system to "say which type, scale and palette you are using" — the baseline failure as an instruction. It now routes several-screen mockups without a system to ryugi:design-system.

## Candidate 2 (routing fix)

| Case          | Result                                                                                                                                                     |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0            | pass                                                                                                                                                       |
| S1 ×2, S3     | turn 1: **loaded the skill and drew a three-system choice group** in all three. Both S1 runs also drew the recommended direction's pages in the same round |
| S1, S3 turn 2 | **fail**: wrote product code (8 files each). S1-2's turn 2 was lost: the runner script was rewritten while it ran                                          |

Rationalization: "we already drew whole product in A … the natural next step is to implement the three pages"; "Design-system says 'continue' means the next stage. But that was in context of artboard rounds."

## Baseline 2 for the revision (candidate-2 skills)

The partner revised the flow to four steps (direction → tokens → layout → rules) with starting points for finished screens without tokens (extract, keep the tone) and for a product doc without code.

| Case | Result                                                                                                                                                               |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S4   | audit found the planted near-duplicates ("五个近似暖灰承担同一个'弱文字'角色"), then drew **three new directions** for a finished app; no layout step in three turns |
| S5   | read the doc; the nine screens drawn in turn 3 are all doc pages; **no layout step** in three turns                                                                  |

## Candidate 3 (revision: four steps, starting points, one step per round)

| Case  | Result                                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0    | pass                                                                                                                                                                                                                                                                  |
| S5 ×2 | **pass 2/2**: three-system choice from the doc's tone; tokens one dimension per group; a layout step in turn 3 with navigation options built from the doc's three tabs and global create entry, header height and wide-screen shell; no product change in three turns |
| S4-1  | **pass**: one board confirming the existing tone, no new directions; token extraction (31 raw colors → 19 tokens); layout recorded from the existing pages; rules from the existing components; no product change                                                     |
| S4-2  | **fail**: drew every step in turn 1, then wrote tokens into the app in turn 2 (8 product files)                                                                                                                                                                       |
| S1 ×2 | **fail**: one direction, no choice group; no product change in turn 2                                                                                                                                                                                                 |

Rationalizations: S1 "would a full design-system multi-round process be overkill? … Small product here indeed" (the clause letting small products merge steps 1 and 2; starting point A also read "no product code" while S1 has a scaffold). S4-2 "the user wants the design system built", then "We've already drawn all steps. Next: apply tokens to code".

Fixes: A is an empty project or a scaffold; a small product shrinks only step 4; each round's message ends "Next: step N (name), drawn after your pick", and after the whole-product pages the next step is the written design; three Red Flags quote the lines above.

## Candidate 4 (A covers scaffolds; small products keep the step-1 choice; each round ends "Next: step N")

| Case  | Result                                                                                                                                                                                                               |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S5    | **pass**                                                                                                                                                                                                             |
| S4-1  | **pass**: one step per turn, no product change                                                                                                                                                                       |
| S4-2  | **fail**: drew all five steps in turn 1 (start C has nothing to choose), then in turn 2 wrote a spec and implemented it without handing it over, committed as `86993b6`                                              |
| S1 ×2 | step 1 now a choice group in both, no code in turn 2; but S1-1 skipped tokens and layout, and S1-2 drew tokens, layout and final pages in one round ("Could produce one token sheet board (not necessarily choice)") |

## Candidate 5 (a step with nothing to choose still ends the round; the written design is its own round)

| Case  | Result                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------- |
| S5    | **pass**                                                                                             |
| S1-2  | **pass**: direction choice, then tokens and a layout choice, no code                                 |
| S1-1  | **fail**: one choice group per page instead of steps; turn 2 built the app (29 files)                |
| S4 ×2 | **fail 0/2**: both drew every step in turn 1, then wrote tokens into the app and committed in turn 2 |

Turn-1 endings explain turn 2: S4-2 ended "是否把 token sheet 落到 `src/styles.css`——你点头我就按同一份契约替换字面量"; S4-1 "落地阶段……按流程等你过板后再写"; S1-1 had no next step at all. "按推荐，继续" then answered their own offer. The one passing S1 ending promised nothing.

## Candidate 6 (start C in one round; a fixed last line)

Decisions the partner accepted: C draws every step in one round, since nothing waits on a pick; each round's message ends with one of three lines (`Next: step N…`, `Next: the written design…`, `Next: ryugi:executing-specs…`); the turn after a round is tested by replaying it from a frozen first turn.

First turns only (they are also the replay bases):

| Run  | Last line                                         | Boards                                                          | Product changes                                   |
| ---- | ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------- |
| S4-1 | `Next: 书面设计，等你回复。`                      | every step in one round; one choice where the code disagrees    | none                                              |
| S4-2 | `Next: 下一步是书面设计，等你回复后开始。`        | same                                                            | `bun.lock` only (installed to screenshot the app) |
| S1-1 | none: ends on the using-ryugi "可能影响判断" list | direction choice only                                           | none                                              |
| S1-2 | none                                              | direction choice, plus pages drawn in the recommended direction | none                                              |

Both S1 runs read design-system; S1-1's thinking had planned "选定后我把这套方向落成 React 页面" before settling on an ending without a next step.

### Turn-2 replays

Each arm resumes one frozen first turn (`run.sh --resume`) and runs only the next turn, in containers. Pass = no product code written or committed; committing the written design under `docs/` is the expected outcome. Only the last line of the frozen first turn differs between arms of the same base.

| Base | Arm             | Last line of turn 1                                        | Turn 2 message                                 | No code                                                            |
| ---- | --------------- | ---------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| S4-1 | as drawn        | `Next: 书面设计，等你回复。`                               | 按推荐，继续                                   | **5/5**, all wrote and handed over the written design              |
| S4-1 | control         | `要不要现在把 token 表落到 src/styles.css？你点头我就改。` | 按推荐，继续                                   | **5/5**, all wrote the written design instead                      |
| S4-1 | realistic       | as drawn                                                   | 板我都看过了，每组都选你推荐的那个，往下走吧。 | **3/3**                                                            |
| S1-1 | as drawn        | none (using-ryugi's risk list)                             | 按推荐，继续                                   | **1/5**: four built the app (11–15 files)                          |
| S1-1 | next line added | `下一步：第 2 步 Tokens，等你选完方向再画。`               | 按推荐，继续                                   | **5/5**, each drew the next step and ended on its own `Next:` line |
| S1-1 | control         | `选好方向后，我就把三块页面写进 app。`                     | 按推荐，继续                                   | **1/5**                                                            |

Reading: in start C the rule that the written design follows the boards holds even against an ending that offers code. In start A the ending decides turn 2: with a next-step line 5/5 stay in design, without one or with an offer to build 1/5. The skill's problem in A was that turn 1 dropped the line: both S1 first turns ended on ryugi:using-ryugi's final-message list instead. Three replays ran to the 15-minute cap (`exit=1`); all three had already written code.

## Candidate 7 (the next-step line becomes the opening state line)

S1, four fresh first turns, each replayed once with `按推荐，继续`.

| Run  | State line                                          | Turn 1 boards                                                    | Turn 2                   |
| ---- | --------------------------------------------------- | ---------------------------------------------------------------- | ------------------------ |
| S1-1 | none                                                | one layout choice per page; no direction choice                  | built the app (24 files) |
| S1-2 | none                                                | three-system direction choice, plus pages in the recommended one | no code                  |
| S1-3 | none                                                | four finished screens, no choice group at all                    | wrote a spec, no code    |
| S1-4 | close: `画好了，等你在画板上选一个方向。` (no Next) | three-system direction choice only                               | no code                  |

All four read design-system. The state line appeared in none as written. S1-3's thinking named the rule ("Strict adherence: step 1 direction board in one round") and still drew the finished screens, reading 「直接画」 as asking for the deliverable. Turn 2 stayed out of code in 3/4.

## Mockup kit (stages point phone boards at `ryugi-iphone`, `pages/tokens.css` and `ryugi-token-sheet`)

Spec: `ryugi-cloud/docs/ryugi/specs/2026-11-19-mockup-kit-design.md`. Skills at candidate 7 plus the stages, landing and `examples/` changes; `ryugi-artifacts` from a local build (server `local-ad6c81f3fc24`) carrying the mockup runtime. Containerized as above; the image rebuild failed on a Docker Hub token fetch, so runs used `ryugi-agent-eval:local` built 2026-11-19 15:01 (OMP 19.0.0), smoke-tested first. S1 two turns, S5 three, `按推荐，继续` after turn 1.

Baseline for phone boards: the earlier S1 and S5 runs (`c7base-s1-*`, `cand5d-s1-*`, `cand5d-s5-1`, `candidate3-s5-*`, `candidate4-s5-1`) drew 45 phone boards, every one hand-built HTML; none had an element to use.

| Run  | Phone boards on `ryugi-iphone` | Values                                                                      | `ryugi-token-sheet`            | Product code                                                                    |
| ---- | ------------------------------ | --------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| S1-1 | 6/6                            | per-direction CSS setting the element variables, then `pages/tokens.css`    | 3 boards (color, type, metric) | none; turn 2 killed (exit 137)                                                  |
| S1-2 | 9/9                            | per-direction theme CSS with the element variables, then `pages/tokens.css` | 1                              | none                                                                            |
| S1-3 | 11/11                          | `pages/tokens.css`                                                          | 2                              | none; committed its written design under `docs/` (turn 2 hit the 15-minute cap) |
| S5-1 | 14/14                          | `pages/tokens.css`                                                          | 1                              | none                                                                            |
| S5-2 | 11/11                          | `pages/tokens.css`                                                          | 1                              | none                                                                            |
| S5-3 | 0/2                            | `pages/tokens.css`                                                          | 1                              | none                                                                            |

51 of 53 phone boards used `ryugi-iphone`; no board hand-drew a status bar, Dynamic Island or home indicator. S5-3's two misses are 390-wide layout skeletons (bottom tabs vs top tabs) with no device chrome at all. Every run kept its values in the element variable names, and every run that reached the token step drew the sheet with `ryugi-token-sheet`.

Step discipline did not change with the kit: S1-2 again drew one choice group per page instead of a direction choice, and S1-1 drew both directions' pages in turn 1 (the "screens in the recommended direction too" Red Flag, for every direction).

## Conclusions

<!-- filled after the runs -->

Raw JSONL, fixtures, the runner and the summariser are kept locally under `.ryugi/evals/design-system-20261119/`.
