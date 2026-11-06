# Artboard choices: pick and submit on the artboard

Approved 2026-11-01. Decided in the document artifact `document/artboard-choices`
(https://ryugi.innei.dev/a/77dJ5pRqaRvZPR7DGFH9A) and the artboard
`artboard/artboard-choices` (https://ryugi.innei.dev/a/3cBp3xju73YiTCwkCGKaE).

## 1. Why

Most brainstorming artboards are "one group per question, its boards are the
options". Answering means switching to the terminal and typing `q1 → b` while
matching ids against the screen. A remark about one option needs the comment
tool, and every comment wakes the agent at once, interrupting a round the
human has not finished. Looking, picking, commenting and submitting should all
happen on the artboard, and the agent should receive a whole round at once.

## 2. Goals, non-goals, anti-goals

- **Goals:** single choice per question group; picks and comments are held
  until submit; with a comment monitor, submit wakes the agent; without one,
  the human says "done" in the terminal; desktop and phone; board labels with
  long titles stop breaking.
- **Non-goals:** multi-select, scoring, ranking; moving boards; changing verify
  groups; generating the next round automatically.
- **Anti-goals:** the agent woken halfway through a round and starting to
  change things; answers changing while the agent draws the next round; old
  artboards (without the new fields) behaving differently; confusing "choose an
  option" with "select an element" (the Inspector's blue selection).

## 3. Constraints

- Zero runtime dependencies for the plugin; new files under `artifacts/` are
  AGPL-3.0-only.
- A change under `artifacts/src/` ships as a release; skill changes need a
  baseline and an after run (AGENTS.md).
- Skill files are English only; viewer UI strings go through the viewer's
  i18n with English and Chinese.
- Claude Code and Codex comment watchers share `createCommentWatch` in
  `skills/artifacts/app/comment-watch.cjs`; the wake logic lives there. Codex's
  event queue in `codex-comment-watch.cjs` (which drops events with zero
  unread) and `register()` in `comment-subscriptions.cjs` may change with it.
  (builder's call, approved)

## 4. Design

### 4.1 canvas.json

Two optional group fields beside `verify`:

```json
"groups": {
  "q1": { "title": "Reply banner layout", "boards": ["q1-a", "q1-b", "q1-c"],
          "choose": true, "recommend": "q1-b" }
}
```

- `check` warns when `recommend` is not a board of the group, and when
  `choose` and `verify` are both true.
- A choice group without `recommend`, submitted unpicked, records "no choice",
  not "by recommendation".
- Groups without these fields look and behave exactly as today.

### 4.2 Rounds

A round is the set of groups under one title note on a page: the same
partition as `roundsOf` in `artifacts/src/viewer/lib/questions.ts`. The round
id is the title note id; groups with no title note above belong to
`page:<page id>`. Move the partition into `shared/` so the server and viewer
use one implementation.

Only the server derives rounds. It writes each round's groups and submission
state to `.ryugi/artifacts/.state/artboard/<id>/rounds.json`; the CJS watchers
read that file and never derive rounds themselves. When the agent starts a new
round, the title note and the round's groups appear in the same `canvas.json`
write, so new groups never fall briefly into the previous round.

### 4.3 Storage

Choices, submits and withdrawals are threads with special anchors in the
artboard's `comments.json`, like verify groups' pass/reject:

- **Choice:** anchor with `group` and `choice` (a board id, or `null` to
  clear). The latest per group wins.
- **Submit / withdraw:** anchor with `round` and `submit: true | false`. The
  latest per round wins.
- The server rejects human writes that choose in a submitted round, choose in a
  group without `choose`, or name a board outside the group.
- These threads do not appear in the comment list and do not count as unread.

**Terminal answers are written to the board.** When the human types `q1 → b`,
or says "done" without clicking submit, the agent records the picks and
submits the round through the CLI (`comment choose --group q1 --board q1-b`,
`comment submit --round <id>`, recorded as agent writes). The board then shows
what the agent received, and the round locks. On conflict, the human's latest
terminal message wins. The "submitted rounds are read-only" rule applies to
human writes; the agent's submit closes the round out.

### 4.4 Drafts and waking

- **Draft comments:** comments anchored inside a choice group (on its boards or
  the group) of an unsubmitted, open round. They are stored and shown as usual;
  `createCommentWatch` emits no event for them.
- **On submit:** the watcher emits
  `{"type":"ryugi-choices","artifact":…,"round":…,"command":…}`, where command
  is `comment list --format brief …`. A withdrawal emits one too, with
  `"withdrawn": true`.
- Comments written after submit are ordinary comments and wake at once.
  Comments elsewhere (older rounds, empty canvas, non-choice groups) always
  behave as today.
- A round **closes** once a later round appears below it, submitted or not.
  A closed round has no drafts; comments there wake as usual; its state in
  `rounds` is `closed`.
- The UserPromptSubmit hook (`hooks/selection-context.cjs`) is unchanged: when
  the human talks in the terminal, draft comments are mentioned too.

### 4.5 CLI output

`comment list --json` adds choice groups to `groups`, and a `rounds` list:

```json
{
  "groups": [
    {
      "id": "q1",
      "kind": "choose",
      "round": "round",
      "recommend": "q1-b",
      "choice": "q1-b",
      "byRecommendation": false,
      "threads": 1
    },
    {
      "id": "q3",
      "kind": "choose",
      "round": "round",
      "recommend": "q3-a",
      "choice": null,
      "byRecommendation": true,
      "threads": 0
    }
  ],
  "rounds": [
    { "id": "round", "page": "ui", "state": "submitted", "submitted": "2026-11-01T08:04:00Z" }
  ]
}
```

Round `state` is `open`, `submitted` or `closed`. Threads stay in `threads`;
draft threads carry `"draft": true`. Text output prints one line per group,
such as `q1 → q1-b (1 comment)` and `q3 → q3-a by recommendation`.

### 4.6 Locking and withdrawal

- After submit the round is read-only: radios disabled, chosen boards keep
  their orange outline as history.
- Withdraw is available until a later round appears on the same page; then the
  submit bar disappears and the round is read-only for good.
- On a withdrawal event, if the agent has not written the next round, it stops
  and waits for a new submit. With a monitor the agent starts within seconds,
  so withdrawal mostly matters without a monitor or before the agent starts.

### 4.7 Is anyone listening?

Each watcher poll writes a heartbeat file beside the subscription file:
`.ryugi/artifacts/.state/{claude,codex}-comment-watch/<session>.alive`
containing a timestamp. (Not inside the subscription file: `register()`
rewrites it on every subscribe.) When a session subscribed to the artboard
(or `*`) has a heartbeat under 10 seconds old, the server tells the viewer
someone is listening. The submit bar then reads "Claude is drawing round N";
otherwise "Say done in the terminal".

### 4.8 Desktop UI

- **Board label** (artboard q1-a and q3-b): radio at the far left; title wraps
  to at most two lines, with the "Recommended" tag and the id following the
  title text; actions (expand, download, parameters, play) fixed at the right
  of the first line; below the current compact threshold the actions collapse
  into a ⋯ menu. The label grows upward; its bottom edge stays on the board.
  Rewrite `lib/board-label.ts`'s layout and drop today's "split into two rows
  with an empty row" behavior. This applies to every board, not only choice
  groups.
- **Chosen:** a 3px orange outline outside the board (`brand.accent`),
  distinct from the Inspector's blue selection.
- **Submit bar** (artboard q2-a): a dark floating bar centered at the bottom of
  the viewport, shown only while the current page has an unlocked choice
  round. States: draft ("Round 1 · 2/4 chosen · 3 comments · q3, q4 by
  recommendation [Submit]"), submitted with a listener ("Submitted 16:04 ·
  Claude is drawing round 2 · Withdraw"), submitted without one ("Submitted ·
  Say done in the terminal · Withdraw"), and hidden when closed.

### 4.9 Phone UI

Artboard q4-a: in the full-screen board view (`PhoneBoard`) a "Choose this"
button sits at the bottom; when chosen it turns solid ("✓ Chosen"), and
another tap clears it. Back in the group view, labels show the same radios as
desktop; `QuestionSheet`'s title row says "chose b" and the progress marks of
answered questions turn orange. The submit bar floats above the sheet.

### 4.10 Skills

- `skills/artifacts/artboard.md`: replace the opening "cannot pick options in
  the browser"; add a "Choice groups" section (fields, reading `groups` and
  `rounds`, what to do after submit, withdrawal events, recording terminal
  answers with `comment choose`/`comment submit`).
- `skills/brainstorming/artboard-rounds.md`: each group gets `choose` and
  `recommend`; the title line says to pick on the board and submit instead of
  "say q1 → b"; Between Rounds reads `groups` first. `q1 → b` in the terminal
  still counts.
- Baseline and after runs per `writing-skills`, kept in
  `docs/ryugi/skill-evals/`.

### 4.11 Cloud

While this computer is on, the cloud link is the same live page and picks go
through the local server. When only the published copy is left, radios and the
submit bar are read-only.

## 5. Left to the builder

- Exact thread/op field names and the ws message shape.
- Animation, hover states, keyboard use (radio reachable by Tab, Space to
  choose) and accessible labels.
- Contents and order of the ⋯ menu.

## 6. Tests

- Unit: choice and submit derivation (latest wins, by recommendation, no
  choice); server rejection rules; shared `roundsOf` unchanged in behavior;
  open/submitted/closed; new `boardLabelLayout`; watcher emits nothing for
  drafts and one event each for submit and withdraw; heartbeat freshness;
  `rounds.json`.
- Hooks: `tests/hooks/test-comment-watch.cjs` and
  `tests/hooks/test-codex-comment-watch.cjs` gain draft, submit and zero-unread
  submit cases.
- UI: ryugi:verifying-ui with desktop and phone screenshots, shown to the human
  partner as a verify group.

## 7. Release

1.50.0: `scripts/bump-version.sh 1.50.0`, tag, push. The viewer changes, so
deploy the cloud from the local build before the npm publish.

## 8. Artifacts

- Document `document/artboard-choices`: the conversation and this design.
- Artboard `artboard/artboard-choices`, page `ui`: q1-a (radio in the label
  row), q2-a (bottom submit bar), q3-b (title up to two lines, actions top
  right, ⋯ when narrow), q4-a (phone: "Choose this" at the bottom of the
  full-screen board).

## 9. Decisions

| Decision                                                                                                                                                                                                                                                                                                                                                          | By                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Pick per question group on the board; each board can be chosen, chosen and commented, or only commented                                                                                                                                                                                                                                                           | human                     |
| A submit button; with a monitor the agent responds only on submit; without one, "done" in the terminal                                                                                                                                                                                                                                                            | human                     |
| Long board-label titles fixed together with this                                                                                                                                                                                                                                                                                                                  | human                     |
| One choice per group; drafts held until submit; `choose`/`recommend`; unpicked takes the recommendation; lock after submit with withdraw; read via `comment list`; one submit per round; server decides who is listening; comments after submit wake; phone included; q1-a, q2-a, q3-b, q4-a                                                                      | accepted recommendations  |
| `q1 → b` in the terminal still works; reuse comment-thread storage; both skills change with evals; release 1.50.0; i18n en+zh; heartbeat file; cloud offline read-only; agent records terminal answers and submits; later round closes earlier; server-only round derivation in `rounds.json`; agent waits on withdrawal; Codex queue and `register()` may change | builder's calls, approved |
