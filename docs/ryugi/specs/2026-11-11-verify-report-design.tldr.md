# TL;DR: verify reports

**What gets built:** a new artifact type, `verify`: the acceptance report
for one piece of work. Its page is the read-only editor with three new
nodes. UI and UX verdicts stay on the artboard, next to the prototype.

**Why:** putting logs and "checked by agent" groups on the artboard meant
placing text at coordinates, fake collapsing, clipped output, and no home
for "Not verified".

## What you'll see

1. A sync or API fix → one report link. Top: what needs you (often nothing). Below: "Checked by agent", one line per claim, open it to read the raw output. Bottom: "Not verified".
2. A UI spec with non-visual requirements → the same report link; the screen parts appear as rows showing their artboard verdict. Click a row to judge it on the artboard.
3. Pure UI work → the artboard verify page, as today. No report.
4. On the report: `J`/`K` between what waits on you, `P` pass, `R` reject. You cannot edit anything.
5. The artboard loses the collapsed agent groups and text boards from the last round; it keeps "from · captured" under each verify group.

## Decisions

| Decision                           | Choice                                                   | By   |
| ---------------------------------- | -------------------------------------------------------- | ---- |
| UI/UX verification                 | stays on the artboard, beside the prototype              | you  |
| Mixed work                         | the report is the one entry; artboard groups as rows     | you  |
| The report page                    | built from the editor components, read-only              | you  |
| Its own type or a document variant | its own type                                             | you  |
| Dividing rule                      | judged by looking at a screen vs. reading output         | mine |
| Verdict storage                    | like artboard verdicts; no collaborative-editing session | mine |
| Recordings, image pins             | not in reports; artboard only                            | mine |

## Check these (my calls)

- **A claim stays in "Needs you" after you judge it**, marked passed or rejected. It does not jump to another section. The header counts only what still waits on you.
- **Rejecting a "checked by agent" claim moves it to "Needs you"** and it stays yours to pass from then on.
- **Waiving a "Not verified" item** is done on the page. If I later reword that item, the waiver is void and it asks you again.
- **No free prose in a report**: one intro paragraph at most, then claims, artboard rows and gaps. Comments attach to a claim or a gap.
- **Pure UI work has no "Not verified" section**; I put that list in my final message.
- **A database migration on the Cloud worker is required** (the table restricts the type). I write it; it must be applied remotely before the worker deploys. I will stop and ask before touching the remote database.
- **About a fifth of last round's viewer work is removed** (collapsed groups, text boards on the canvas). The state model, text rendering, CLI wording, skill and eval carry over.

## Time

About 6 working days: the type across server, CLI, worker and Cloud app 2 days; nodes and the page 1.5 days; verdicts and CLI 1 day; taking the artboard additions out half a day; skills and eval 1 day.
