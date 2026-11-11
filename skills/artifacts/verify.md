# Verify reports

A verify report is the acceptance report for one piece of work: each claim
you make about it, the evidence, where the evidence came from, and what you
did not verify. Your human partner reads it top to bottom and cannot edit
it; they pass, reject and waive.

One report per piece of work, at `.ryugi/artifacts/verify/<id>/`:

```
report.xml     you write
evidence/      files you captured; you write
comments.json  the server writes; never edit
```

## What goes here, and what stays on the artboard

- **Judged by reading output or numbers** goes in the report: the log of an
  end-to-end run, API status, row counts, a migration result, which build
  is deployed and what it serves, a measured number against a threshold you
  wrote down first, a downstream build, an eval tally.
- **Judged by looking at a screen** stays in an artboard verify group
  (`artboard.md`): a built screen beside its prototype, a visible bug before
  and after, motion, device screenshots. Never put screenshots or
  recordings in a report.
- **Both kinds in one piece of work**: both artifacts, and the report lists
  each artboard verify group as a row. Give the report's link.
- **Only screen claims**: the artboard alone, no report.

## report.xml

```xml
<report title="Offline edits survive a reconnect">
  <p>Fix in <code>src/sync/merge.ts</code>, deployed to staging.</p>

  <claim id="converge" judge="agent"
         from="staging build 4812 @ 9f3c2aa" capturedAt="2026-11-11T09:40:12Z">
    <title>Offline edits from two devices both survive a reconnect</title>
    <output src="evidence/sync-e2e.txt" />
  </claim>

  <claim id="rounds" judge="human"
         from="staging build 4812 @ 9f3c2aa" capturedAt="2026-11-11T09:41:00Z">
    <title>Is 3 rounds to converge acceptable for this release?</title>
    <ask>Wrong if you expected one round; the old build took 7.</ask>
    <p>Measured over <b>20</b> runs.</p>
    <output src="evidence/rounds.txt" />
  </claim>

  <ref artboard="settings-redesign" group="v2" />

  <gap id="prod">
    <title>The same run against production</title>
    <why>No production credentials in this environment.</why>
    <needs>A production test key, or your go-ahead to skip it.</needs>
  </gap>
</report>
```

- `<report title>`: required. At most one `<p>` first, to introduce the
  work. After it, only `<claim>`, `<gap>` and `<ref artboard group>`, in any
  order. No headings and no other prose at the top level; `check` refuses
  them. The page sorts everything into three sections itself: Needs you,
  Checked by agent, Not verified.
- `<claim>`: `id` (short, unique, stable: verdicts and comments attach to
  it), `judge`, `from`, `capturedAt`, then a `<title>` that states the
  claim, then its evidence.
- `from`: the environment and the build ("production · 1.71.0 @ 64e2eca",
  "staging build 4812"). `capturedAt`: the ISO time you captured the
  evidence (`date -u +%Y-%m-%dT%H:%M:%SZ`). Update both whenever you
  replace evidence. `check` notes a claim that lacks either.
- Evidence inside a claim: `<output src="evidence/…">` for a captured file,
  shown as it is in monospace; and `p`, `ul`, `ol`, `codeblock`, `img`,
  `alert`, `details` with inline marks for a short note on it. Redirect a
  command's output into the file; never retype or summarize it. Not `.html`:
  save as `.txt`. Past 200,000 characters the page says how much it left
  out.
- `<gap>`: one thing you did not verify: `id`, `<title>`, `<why>` you
  could not, and `<needs>`: the one thing that would let you.
- `<ref artboard="<id>" group="<group>" />`: a row for a claim judged on
  the artboard. It shows that group's verdict and opens the artboard.

## Who judges a claim

`judge="agent"`: a command decided it. All of these hold:

1. The title states something a command decides: equal or not, a status, a
   count, a number against a threshold written down before measuring.
2. The command ran where the claim is about, not in a nearer stand-in.
3. Its raw output is in the claim (`<output>`, or a `codeblock` for a line
   or two), and the claim has a `from`.

The page shows it as one collapsed line under "Checked by agent"; nothing
waits on it. Without output or without `from` it waits on a verdict like a
human claim. A check that failed is never `judge="agent"`: fix it, or make
it a `<gap>`.

`judge="human"`: a judgement this work left open, and it is not about a
screen: a threshold you picked, a trade-off you made, whether a sample is
big enough. Add `<ask>` saying what would make it wrong. `check` refuses a
human claim without one. Most reports have none. Do not add one to re-ask
what the spec, the bug report or your human partner already decided, and
never to have something for them to press: a report where every claim is
checked by you is a finished report.

Once your human partner rejects an agent claim it is theirs for good: it
moves to "Needs you" and is done only when they pass it. New evidence from
you never returns it to "Checked by agent".

## Reading and recording verdicts

```bash
node app/ryugi.cjs comment list --project-dir /path/to/project --artifact verify/<id>
# Comment list: verify/sync-fix · 1 to act on
# Waiting: 1 on your human partner · 1 not verified
# Claims · 1 rejected · 1 pending · 1 checked by agent
#   retries · rejected · 1 reject thread · No retry storm
#   rounds · pending · from staging build 4812 · Is 3 rounds acceptable?
#   converge · checked by agent · from staging build 4812 · Offline edits survive a reconnect
# Artboard rows · 1
#   settings-redesign/v2 · pass
# Not verified · 1 open
#   prod · not verified · The same run against production
# Threads · 1 open
#   t1 · claim retries · reject · human: the log shows a retry storm
```

One request returns everything; a report has no `--section`, `read` or
`ack`. "To act on" counts rejected claims: fix each, replace its evidence,
update `from` and `capturedAt`, and `comment reply --thread <id>` with what
changed. A verdict goes back to pending when the claim's XML or its output
files change; so does a waiver when its gap is reworded.

Record a verdict only when your human partner says it in chat:

```bash
node app/ryugi.cjs comment pass --project-dir … --artifact verify/ rounds < id > --claim
node app/ryugi.cjs comment pass --project-dir … --artifact verify/ < id > --all
node app/ryugi.cjs comment reject --project-dir … --artifact verify/ retries --text "<their reason>" < id > --claim
node app/ryugi.cjs comment waive --project-dir … --artifact verify/ prod < id > --gap
```

`--all` passes every claim that waits and skips the ones you checked. The
page labels these as recorded by the agent. Never pass, reject or waive on
your own judgment.

The report is done when no claim is pending or rejected, every artboard row
has passed, and every gap is waived or gone.
