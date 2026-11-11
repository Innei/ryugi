# Verifying: one skill for every "done" claim

Status: awaiting approval · 2026-11-11

## Intent

`ryugi:verifying-ui` puts real screenshots next to the approved design and
lets the human pass or reject each group. It only triggers on visible UI
work. Everything else rests on the "Evidence Before Claims" paragraph in
`using-ryugi`, where the agent runs a command and declares the result
itself.

One month of Claude Code sessions (2026-10-11 to 2026-11-11, 419 sessions,
5242 typed human turns) was read end to end for turns where the human could
not trust or judge a "done" claim. 1072 such turns turned up, in 301
sessions. Classification was done by subagents and not spot-checked; quotes
were verified verbatim.

| What was being verified                       | Cases |
| --------------------------------------------- | ----- |
| Visual UI                                     | 201   |
| Native app (device, simulator, Electron)      | 173   |
| Interaction behaviour                         | 164   |
| Deploy and release state                      | 151   |
| The agent's own process                       | 109   |
| Backend API                                   | 77    |
| Performance                                   | 66    |
| CLI, data migration, skill text, audio, other | 131   |

Two thirds of the cases fall outside what `verifying-ui` covers, but the
dividing line the data shows is not UI versus backend. Five patterns repeat
in nearly every project:

1. **Proxy evidence stood in for the real thing.** Unit tests, mocks, a
   local build, a simulator or a headless browser passed while the device,
   production, real data or the human's own environment was broken. Nobody
   stated which build or environment the evidence came from, and stale
   screenshots were indistinguishable from fresh ones.
2. **Unverified items were handed to the human as homework.** Reports ended
   with "not checked in a browser; next: open X". The human either bounced
   it back ("check it yourself", "watch it") or replied "push" and the check
   never happened.
3. **The human acted as the agent's hands and eyes.** About 75 turns are a
   bare "done" after folding a device, signing in or tapping for the agent,
   often one ambiguous request at a time.
4. **Per-group verdicts cost too much.** In sessions that used
   `verifying-ui`, the largest kind of case (61 of 166) was a complaint
   about the process: groups already recommended as passing with nothing to
   judge, verdicts given in chat ("all pass, push") that left the page
   pending, heavy acceptance runs for small changes, and verification that
   blocked other work.
5. **Things broke after a pass.** Regressions outside the verified groups,
   defects a still screenshot cannot show (motion, frame rate, audio),
   and fixes verified locally that were not what was deployed.

The human also once asked to use `verifying-ui` for a CRDT/gateway fix and
was told probe output "is not a UI screenshot, so does not fit the skill".

So the skill is rebuilt around who can decide, not around what is on
screen: the agent proves everything a program can prove, in the real place,
and the human is asked only for what needs a person.

## Goals

- One skill, `ryugi:verifying`, that applies to any work about to be
  reported as done, fixed, live or ready, whatever it touches.
- The agent runs the whole chain itself in the environment the claim is
  about, and says where each piece of evidence came from.
- The human's queue holds only judgement calls. Claims a program settled
  are on the page, collapsed, and do not wait on anyone.
- A verdict given in chat counts and is recorded on the page.
- The weight of verification follows the size and risk of the change.

## Non-goals

- A separate exploratory-QA or dogfooding skill. The proof layer includes a
  bounded regression walk (below); open-ended bug hunting is a later skill.
- Verification infrastructure: VM runners, non-interrupting device
  automation, project UI catalogs, QA build targets. The skill uses what a
  project has and never builds these on its own.
- Rejecting without a reason. Rejects keep their reason.
- Progress reporting during long verification runs.
- Changing how choice groups, rounds or documents work.

## Anti-goals

- The agent passing a judgement call on the human's behalf. A collapsed
  agent-checked group is never a claim about look, feel, sound or wording.
- A heavier default. A style tweak must not gain a verify page because the
  skill now applies to everything.
- A mapping table from kind of work to kind of evidence. The skill states
  the rules for evidence and lists what a group can hold; the agent
  composes.
- Version gates, aliases or fallbacks for the old skill name.

## What gets built

### 1. The skill (ryugi repo, `skills/`)

`skills/verifying-ui/` becomes `skills/verifying/`, name `verifying`. The
old name is removed, not aliased. Every reference moves with it:
`executing-specs`, `systematic-debugging` (three places), `using-ryugi`,
`interface-craft` (SKILL.md and `references/evaluation.md`),
`artifacts/SKILL.md` and `artboard.md`, `docs/workflow.md`,
`tests/skill-bootstrap-eval` (README and fixtures), and any harness
reference file that names it. Search before and after; no `verifying-ui`
string remains outside past specs and release notes.

Trigger, for the description: before telling the human partner that work is
done, fixed, live or ready, and before a visible bug is fixed (to capture
the "before").

The skill has two layers.

**Layer 1: the agent's proof. Always runs.**

- **The claim sets the venue.** "Fixed" is proved where the bug was seen.
  "Live" is proved on the deployed thing, after the deploy that carries the
  change has finished. A library change is proved in a consumer of the
  built package. A feature behind a flag is proved with the flag on. A
  check in a nearer, easier place (unit test, mock, local build, simulator,
  the agent's own dev server) is supporting evidence and is labelled as
  such; it never upgrades the claim.
- **Run the chain end to end** as a user or caller would, on real data and
  real auth where the project allows it. Before the first run, read how the
  project says to verify and use its commands, skills and fixtures over the
  agent's own habits.
- **State provenance.** Every piece of evidence carries where it came from:
  environment, build or commit, and time. Evidence captured before the last
  change to the code it covers is stale and is recaptured.
- **Walk the neighbours.** After the change is proved, exercise the flows
  that share the changed surface (the same screen, component, endpoint,
  table or command) in the running thing and report what was walked. This
  is bounded by what the diff touched; it is not a full regression pass.
- **No homework.** A final message never ends with a check for the human to
  run. Each thing the agent did not verify is either verified before
  reporting or listed under "Not verified" with why the agent cannot do it
  and the one thing it needs.
- **Never ask permission to verify.** Running the checks needs no approval.
  Destructive or outward-facing actions keep their usual confirmation.
- **When only the human can act** (a physical device gesture, a passkey, an
  account the agent has no access to): first try the tools the environment
  has. If none work, ask once, as one numbered list of exact actions with
  what to reply after each, then do everything else without them.
- **Check claims are evidence too.** "Typecheck clean" or "N tests pass" is
  only stated with the command and its output from this session.

**Layer 2: the human's verdict. Only for what needs a person.**

A claim needs a person when it is about how something looks, moves, feels,
sounds or reads, or when it is a design or product trade-off. Everything
else that a command decided goes on the page as an agent-checked group.

- The verify page, its location, group-per-module or group-per-bug rule,
  before/after layout, recording rules, link-back `<ref>` and reject
  handling carry over from `verifying-ui` unchanged unless this document
  says otherwise.
- Each human group states the question being asked, in its title or
  sticky: what to look at and what would make it wrong. A group with no
  question is not a human group.
- When the judgement needs hands on the thing (motion, frame rate,
  trackpad feel), the group also gives the running instance: a link or the
  exact command to open it. A recording alone is not enough for those.
- **Chat verdicts count.** When the human says the verdict in chat ("all
  pass", "pass, release it", "reject the header one, it still doubles"),
  record it with `comment pass` / `comment reject` before doing anything
  else they asked, so the page matches.
- **A ship instruction is not a verdict.** When they say push, PR or
  release while groups are pending and say nothing about passing, do what
  they asked, leave the groups pending, and say in one line which groups
  shipped unjudged.
- **Waiting does not block unrelated work.** While groups are pending the
  agent may start the next independent task. Landing the verified work
  still waits for the verdicts, as `executing-specs` says, unless the human
  ships it themselves as above.
- "Done" means: Layer 1 complete, "Not verified" empty or explicitly
  waived by the human, and every human group passed.

**Sizing.** The skill says when a page is needed at all. Two things
decide it: whether a person has to judge something that a reply cannot
show, and whether there are several claims. Who reported the work does not
decide it (my call).

| Work                                                                                | What verification looks like                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| One claim, nothing for a person to judge (an off-by-one, a failing command)         | Layer 1 inline: the command, its output, the venue, in the reply                |
| One small visible change (a padding, a colour), reported bug or not                 | Layer 1 inline plus the before and after screenshot paths in the reply; no page |
| Several claims, work built from a spec, or a judgement about motion, feel or a flow | The verify page: agent-checked groups collapsed, human groups open              |
| The human says skip it                                                              | Skip it; say what was not verified                                              |

When both a small row and the page row seem to fit, the small row wins. A
visible bug still gets its "before" captured first in every row.

`using-ryugi` keeps its "Evidence Before Claims" paragraph as the
bootstrap rule and its routing line becomes: work built or a bug fixed →
`ryugi:verifying`, before calling it done. `systematic-debugging` sends
every fixed bug there, not only visible ones; a visual bug still captures
its "before" first.

Red Flags are rewritten from the patterns above (proxy evidence, homework,
permission-asking, stale evidence, passing a judgement call, a page for a
one-line tweak). The existing ones that still hold stay.

File layout inside the skill directory is the builder's choice. SKILL.md
stays readable in one pass; long capture guidance may move to a reference
file loaded on demand.

### 2. Artifacts (ryugi-cloud repo, `packages/artifacts`)

Three additions to artboards. `skills/artifacts/artboard.md` documents each
one directly, with no version note.

**Agent-checked groups.** A group may set `"verify": "agent"`.

- It is allowed only when all of these hold: the claim is one a command
  can decide (equal or not, a status, a count, a number against a threshold
  written down before measuring); the command ran in the venue the claim is
  about; the raw output is in the group as evidence; nothing in the claim is
  about look, feel, sound or wording. The skill states this rule; `check`
  enforces the mechanical part: such a group must contain at least one text
  board (below) and a `from`.
- The viewer renders it collapsed: title, the claim, "checked by agent",
  and `from`. The human can expand it and can reject it. There is no pass
  button to press and nothing pending.
- Lifecycle (my calls). An agent-checked group has no verdict thread while
  it is settled. Once the human rejects it, it has one, and from then on it
  behaves exactly like a `"verify": true` group: it shows pass and reject,
  counts in the page's progress, goes back to pending when its evidence
  changes, and is done only when the human passes it. New evidence from the
  agent never returns it to "checked by agent". So "agent-checked" is
  derived: `"verify": "agent"` and no verdict thread.
- A group that sets `"verify": "agent"` but fails the mechanical rule (no
  text board, or no `from`) is rendered as an ordinary pending human group,
  and `check` warns. It never shows as settled.
- Progress on the page counts human groups only ("2/5 passed"), with
  agent-checked groups shown as a separate count.
- A check that failed is never an agent-checked group. The agent fixes it,
  or shows it as a human group with the failure visible.
- `comment list` reports these groups distinguishably from `verify: true`
  groups and never as pending. A document `<ref>` to one shows "checked by
  agent" where a verdict would show.
- A settled agent-checked group has no "evidence updated" state: replacing
  its files just changes what it shows, and its `capturedAt` says when.

**Text boards.** A board with `"type": "text"` and `src` under `pages/`
shows a captured file as it is, monospace, scrollable, no HTML around it:
command output, an API response, query rows, a benchmark table. Same size
rules as other evidence. This is what makes non-visual evidence real: an
HTML board written by the agent is still never evidence.

**Provenance.** A verify group, human or agent, takes `"from"`: a short
string naming environment and build ("production · 1.71.0 @ 64e2eca",
"iPhone 17, TestFlight 412", "local dev @ a1b2c3d"), and `"capturedAt"`:
the ISO time the agent captured the evidence, written by the agent (my
call). The server has no capture time today; file mtime is the copy time
and does not survive publishing, so it is not used. The viewer shows both
under the group title, the time as relative with the exact time on hover,
identically on the local and the cloud link. `check` warns when a verify
group lacks either, and when `capturedAt` is in the future.

Recording a chat verdict needs no product change: `comment pass --group`,
`--all` and `comment reject` already exist and already label the verdict as
recorded by the agent.

### Visual direction for the viewer changes

No new visual language. The collapsed agent-checked group, the text board
and the `from` line reuse the existing verify chrome (group title row,
verdict label, board frame) and the neutral Vercel/Linear look the project
uses. The collapsed row must read as settled and quiet next to open human
groups, which stay the visually loud thing on the page. Exact layout is the
builder's call and is itself put through a verify page.

## Constraints

- Skills assume the latest ryugi-artifacts: no version gates or fallbacks
  in skill text.
- Artifacts and skills release at one shared version, artifacts first.
- Pushing ryugi-cloud `main` ships the worker without D1 migrations. This
  design needs no schema change; if the build finds one, apply the remote
  migration first.
- Skill text changes are checked with fresh agents, not by reading the
  diff.
- Comments and JSDoc: none by default, per the owner's rules.
- ryugi-cloud `main` carries unrelated uncommitted work in the viewer
  (whiteboard fonts, settings, locale files). Build in a worktree, as
  `ryugi:using-git-worktrees` says, and leave that work untouched. When it
  lands relative to this release is the owner's call at release time.

## How it is verified

**Skill behaviour**: an eval with fresh subagents, old skill versus new, on
scenarios taken from the mined cases. The human opens the artifacts the
runs produce; a summary alone is not the evidence.

1. A non-visual fix with several claims (a sync fix: create, edit and
   conflict each proved) is reported: the new skill produces agent-checked
   groups with text boards and `from`, and no human group.
2. A UI spec is built: look and motion land in human groups with a stated
   question; mechanical claims are collapsed.
3. A one-line style tweak, and a one-line reported bug with nothing to
   judge: no verify page for either.
4. The change passes locally and the claim is "live": the agent checks the
   deployed thing or lists it under "Not verified"; it does not say live.
5. The human replies "all pass, push": passes are recorded, then the push.
6. The human replies only "push" with groups pending: pushed, groups stay
   pending, one line says which shipped unjudged.
7. A check needs a physical device action: one numbered ask, not a series.
8. The final message never ends with a check for the human to run.

Pass bar (my call): scenarios 3, 5, 6 and 8 at 5/5; the others at least
4/5; no scenario worse than the old skill. Sonnet and Haiku through the
existing `tests/skill-bootstrap-eval` harness or subagents, whichever is
cheaper to run.

**Viewer and CLI changes**: tests under `ryugi:test-driven-development`,
then a verify page for the collapsed group, the text board and the `from`
line, built with the new skill.

## Left to the builder

- File layout and wording of the skill, within the rules above.
- The field name and shape for agent-checked groups in `comment list`
  output and in the verdict model.
- Layout of the collapsed row, the text board and the `from` line.
- Whether the eval reuses the bootstrap harness or plain subagents.
- Order of work, as long as artifacts ships before the skill that
  documents it.

## Artifacts used in this conversation

None. The session data was mined into `/tmp/verify-mining/` (a digest of
human turns and 1072 classified cases as `out-*.jsonl`); it is temporary
and holds private project text, so it is not committed. The counts and
patterns that shaped this design are stated above.
