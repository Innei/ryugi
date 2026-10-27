# Skill eval: artboard selection and node IDs

Date: 2026-10-20
Change: `skills/artifacts/artboard.md`: `selection.json` in the Directory map and a new "Selection and node IDs" section.
Method: `writing-skills` subagent scenarios, Opus, skill files copied to a scratch directory; baseline = files at `main`, with = files on this branch. Each run acted in its own sandbox project: artboard `pricing` with boards `hero-1` and `hero-2` (three `.card` divs each), `.state/server-info`, and a `selection.json` with `hero-2#7` (the Team card) selected and tweaked (`padding` 14px → 24px, `border-radius` 8px → 16px). No hook: this measures the harnesses that only read the file.

## Scenario 1: typed ID, "把 hero-2#7 的 padding 改大一点"

| Check                               | Baseline                                                                                             | With change                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Edited the Team card on hero-2 only | yes (inline style)                                                                                   | yes (inline style)                                                            |
| How it found the node               | listed the project, found `selection.json` by chance; "the skill docs don't mention the `#N` format" | read `selection.json` third, citing the skill: resolve the ID against `nodes` |
| Files read before the edit          | 6, including hero-1.html                                                                             | 5                                                                             |

## Scenario 2: selection with the hint "they selected an element and adjusted some of its CSS", "就按我调的样子改一下选中的这个" (baseline only)

Applied both tweaks to the Team card only. Found `selection.json` by listing `.state`; "the skill docs say nothing about the selection or Inspector state".

## Scenario 3: no hint, "这里再大一点"

| Check                                     | Baseline                                                      | With change                                                      |
| ----------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------- |
| Resolved "这里" to the selected Team card | yes                                                           | yes                                                              |
| Used the previewed tweaks                 | yes (kept radius, padding past 24px)                          | yes (same)                                                       |
| How it found the selection                | listed the project; "the skill files never mention selection" | "artboard.md says to read selection.json whenever they say 这里" |

## Reading

The sandbox is small enough that a baseline agent finds `selection.json` by listing directories, so outcomes match. The change moves that from exploration to an instruction: every with-change run went to the file directly and cited the rule. In a real project, where `.state/` is one of many directories, the baseline path depends on the agent choosing to look there. The Claude Code hook removes the need either way.
