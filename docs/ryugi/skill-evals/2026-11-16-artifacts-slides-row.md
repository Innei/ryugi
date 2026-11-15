# Artifacts skill: a `slides` row in "Pick the type"

Date: 2026-11-16. Change: one row added to the "Pick the type" table of
`skills/artifacts/SKILL.md`, after the `document` row:

```
| Something they will present to an audience — a talk, a team share-out, a launch                     | `slides`                   |
```

Trigger: `ryugi-artifacts` gains a `slides` type (ryugi-cloud spec
`2026-11-15-slides-type-design`, section 3). Without a row the skill never
names it.

## Method

Wording micro-test. Each sample is one stateless model call with no tools and
no history, through the harness's `completion` helper on its default model.
The system prompt is the whole skill (A: `main` at 4f13ff8b, B: with the row)
inside this frame:

> You are a coding agent working in the project /work/app, with a shell tool
> and a file-editing tool. The skill below is loaded for this session. […]
> Reply with only the first shell command you would run for the request, on
> one line, with no commentary. If you would answer in text without opening
> an artifact, reply with the single word TEXT.

The answer is scored by the type in `--artifact <type>/<id>`. 5 samples per
scenario per variant, 60 calls in all. Three scenarios are
something to present (`t*`); three are guards that must keep their type (`g*`).

## Results

| Scenario        | Request                                                                                                                            | A (no row)   | B (with row) |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------ |
| `t1-all-hands`  | I'm presenting the retry-policy change at Friday's all-hands, 15 minutes. Put the deck together.                                   | document 5/5 | slides 5/5   |
| `t2-share-zh`   | 下周要在团队分享会上讲白板引擎替换，帮我把要讲的内容做出来。                                                                       | document 5/5 | slides 5/5   |
| `t3-launch`     | We launch the new billing page next week and I have to walk the sales team through it live on a call. Prepare what I'll show them. | document 5/5 | slides 5/5   |
| `g1-design-doc` | Write up the design for the retry policy so the team can read it and comment before Friday.                                        | document 5/5 | document 5/5 |
| `g2-directions` | Show me three directions for the settings page navigation.                                                                         | html 5/5     | html 5/5     |
| `g3-report`     | Write a report on last week's outage for the team to read.                                                                         | document 5/5 | document 5/5 |

Every sample was a `start` command; none answered TEXT or left the type out.

- Without the row, all 15 presentation requests opened a `document`.
- With the row, all 15 opened `slides`, and all 15 guard requests kept
  the type they had without it. Samples of one scenario agreed with each
  other in both variants.

## Not covered

- The skill was already loaded in every sample. Whether a request for a deck
  loads the skill at all depends on its `description`, which this change
  leaves alone.
- No sample ran the command: the row must not reach users before a
  `ryugi-artifacts` release that accepts `slides/<id>`.
- One model, written scenarios, no pressure. The row is routing reference,
  not a discipline rule.
