# Brief output contract: baseline comparison

Date: 2026-11-27. Change: the text Brief and hook wake messages print results, evidence and handles, and no next step; `comment reply` / `resolve` consume a thread's delivered messages (thread `ack` is gone, document `changes` keeps it); no skill or guide requires a re-read before an edit. A complete open thread and a changes receipt name the command that spends their handle. Repositories: ryugi-cloud `worktree-brief-output-contract`, ryugi `brief-output-contract`. Design: `document/comment-watch-efficiency` in ryugi-cloud, whose "基线结果" section carries the same numbers. Harness and raw results: [`2026-11-27-brief-contract/`](2026-11-27-brief-contract/).

## Scenario

Ten comment tasks on seeded documents (`short-reply`, `long-thread`, `multi-thread`, `follow-up`, `question`, `resolve-only`, `find-block`, `pagination`, `two-docs`, `concurrent-edit`). Each run gets its own hub (`RYUGI_SERVER_HOME`, `XDG_*`, `RYUGI_DAEMON_BIN` pinned to the build beside its CLI) and a launcher wrapper that logs every call to `calls.jsonl`. The prompt inlines the arm's skill CLI rules (`skills/before.md`, `skills/after.md`). Claude Code runs are subagents on claude-opus-5-5, usage read from their transcripts; Codex runs are `codex exec --json` on its default model at medium reasoning effort (`run-codex.sh`), usage read from `turn.completed`. Before = ryugi-cloud dad889ce + ryugi c11db263. After = skill ryugi 2b965d1a with CLI 7c78d9b5 for Claude Code and CLI 38d7b209 for Codex. Three runs per task, host and arm: 120 graded runs. A run completes when every content check passes, every open thread got a reply or a resolve, and nothing is left unread; `concurrent-edit` also checks that a human edit made mid-run survives.

Turns are model round trips: distinct assistant messages in a Claude transcript; command executions plus agent messages in a Codex event stream. The action share is the part of CLI output that only told the agent what to run next; a handle's usage on a thread line or receipt counts as evidence, since it names which command consumes that handle.

## Results

| Metric per run                             | Claude Code before → after | Codex before → after   |
| ------------------------------------------ | -------------------------- | ---------------------- |
| Total tokens                               | 127.8k → 107.0k (−16%)     | 164.2k → 143.7k (−13%) |
| Input tokens                               | 126.3k → 106.0k (−16%)     | 163.5k → 143.0k (−13%) |
| Output tokens                              | 1517 → 1077 (−29%)         | 788 → 686 (−13%)       |
| CLI output chars (reference)               | 5032 → 1739 (−65%)         | 4705 → 3024 (−36%)     |
| Action share of CLI output                 | 49% → 0%                   | 51% → 0%               |
| Turns                                      | 20.8 → 15.8 (−24%)         | 12.9 → 12.1 (−6%)      |
| Tool calls                                 | 22.8 → 17.2 (−24%)         | 10.9 → 10.1 (−7%)      |
| Completed                                  | 30/30 → 30/30              | 30/30 → 30/30          |
| Human edit overwritten (`concurrent-edit`) | 0/3 → 0/3                  | 0/3 → 0/3              |

### Turns and tokens per task

Means of three runs, before → after.

| Task              | Claude turns | Claude tokens | Codex turns | Codex tokens |
| ----------------- | ------------ | ------------- | ----------- | ------------ |
| `concurrent-edit` | 24.0 → 24.3  | 165k → 160k   | 14.3 → 14.0 | 197k → 178k  |
| `find-block`      | 8.3 → 8.3    | 90k → 90k     | 8.3 → 6.7   | 148k → 101k  |
| `follow-up`       | 20.0 → 15.0  | 141k → 112k   | 10.7 → 11.7 | 189k → 163k  |
| `long-thread`     | 24.7 → 14.7  | 170k → 110k   | 12.0 → 10.3 | 173k → 148k  |
| `multi-thread`    | 29.0 → 19.0  | 161k → 111k   | 13.3 → 14.0 | 157k → 159k  |
| `pagination`      | 26.7 → 20.7  | 107k → 98k    | 25.0 → 20.7 | 172k → 140k  |
| `question`        | 8.3 → 7.7    | 87k → 95k     | 8.0 → 9.0   | 154k → 111k  |
| `resolve-only`    | 10.0 → 7.0   | 65k → 64k     | 6.7 → 7.0   | 88k → 91k    |
| `short-reply`     | 20.7 → 15.0  | 142k → 110k   | 10.7 → 10.0 | 156k → 138k  |
| `two-docs`        | 36.0 → 26.0  | 150k → 120k   | 19.7 → 18.0 | 210k → 208k  |

### Where the turns go

| Launcher calls per run | Claude before | Claude after | Codex before | Codex after |
| ---------------------- | ------------- | ------------ | ------------ | ----------- |
| `--help` lookups       | 0.97          | 0.03         | 1.17         | 1.83        |
| `comment list`         | 2.13          | 2.30         | 1.77         | 1.83        |
| `get`                  | 1.13          | 1.33         | 0.77         | 1.83        |
| `write-document`       | 0.87          | 0.80         | 0.67         | 0.70        |
| `comment ack`          | 1.20          | 0.00         | 1.20         | 0.00        |
| `changes`              | 0.00          | 0.00         | 0.00         | 0.10        |
| All calls              | 12.30         | 9.87         | 12.43        | 11.20       |

Claude Code drops the `ack` call and the `--help` lookups, which is most of its five saved turns. Codex drops the `ack` call too but still runs about 1.8 `--help` lookups a run (across 30 runs: `start` 23, `write-document` 14, `comment reply` 11, `check` 3, `comment resolve` 2, `changes` 2). With the thread line printing the whole `reply --thread t1 --text <message>`, `comment reply --help` fell only from 13 to 11, every one of them after the line was read and next to `write-document --help` or `check --help`: Codex checks flags before a write whatever the output says. Most of what the later rounds saved came from shorter help (Codex help output 2233 → 1045 chars a run, start excluded), not from fewer lookups.

Codex command results excluding help fell from 3953 to 1969 chars a run, in line with Claude's 4115 → 1730. Total tokens fall less than CLI output because every turn resends the whole context (about 145k input tokens a Codex run, mostly cached); totals follow turns. Three runs per cell cannot separate Codex changes within ±5% from noise.

## Rounds

The first after round used more tokens than the baseline (Claude Code +28%). Each round's finding was fixed and the after arm re-run in full (Codex only for the last two); superseded rounds are kept in `results/stale-*`, named for what they ran without. Token change is against the same before arm.

| Round                                 | Finding                                                                                                                                                               | Fix                                                                                                                                                                                                                                           | Claude tokens | Codex tokens |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------ |
| `stale-skill-text` (partial, 32 runs) | The skill named `comment list --all --detail`, which the CLI rejects, and a section cursor under `--sections all`                                                     | ryugi fcd4c9c9: `--sections all --detail`; pass `--section` with a cursor                                                                                                                                                                     | +28%          | −3%          |
| `stale-base-compare`                  | With no re-read rule, agents built `--base` from captured `get --source` output, which drops the trailing newline: 23/30 Claude saves refused                         | ryugi-cloud 7c78d9b5: the base comparison ignores trailing whitespace                                                                                                                                                                         | +28%          | −10%         |
| `stale-no-reply-syntax`               | With no printed Reply/Resolve command, every after run ran `comment reply --help` first (39 Claude, 77 Codex lookups, up to 8.9k chars a run)                         | ryugi 2b965d1a: the skill names `comment reply` / `comment resolve` syntax                                                                                                                                                                    | −3%           | −10%         |
| `stale-no-handle-usage` (Codex only)  | Codex still ran about two `--help` lookups a run (`comment reply` 14, `comment resolve` 8, `write-document` 14 in 30 runs); one `comment reply --help` was 2.0k chars | ryugi-cloud 715279f0: a complete open thread prints `reply/resolve --thread <id>` (a reject: `reply`), a changes receipt prints `changes ack --receipt <receipt>`; `comment reply`/`resolve` help covers that action alone (2028 → 782 chars) | (not re-run)  | −6%          |
| `stale-handle-no-text` (Codex only)   | Codex read the thread line and still ran `comment reply --help` (13/30): the line did not say how the message is passed                                               | ryugi-cloud 38d7b209: the line reads `reply --thread <id> --text <message>, resolve --thread <id>`                                                                                                                                            | (not re-run)  | −11%         |
| final                                 |                                                                                                                                                                       |                                                                                                                                                                                                                                               | −16%          | −13%         |

## Not measured

The hook wake path: every run starts from a prompt, not from a `watch-comments` wake, so savings in notification delivery are not in these numbers; the hook is covered by its node tests against a fake hub. Rejects, answer and choice submission, Cloud link reads, and concurrent human edits on slides, storyboard and html are not in the task set. Claude Code's after arm was not re-run on 715279f0 or 38d7b209, so the handle text on thread lines is not in its numbers.

## Reproduce

```bash
export BRIEF_EVAL_BEFORE_CLI=<before adeck> BRIEF_EVAL_AFTER_CLI=<after adeck>
node harness.mjs prepare <before|after> <task> <rep> <claude|codex>   # seeds an isolated run directory and its prompt
node harness.mjs grade <run dir>                                       # content, reply, unread and human-edit checks
BRIEF_EVAL_VARIANTS=after node matrix-codex.mjs <reps> <concurrency> <task>...   # Codex arm; variants default to before,after
node aggregate.mjs                                                     # results/summary.json
```

Claude Code runs were dispatched as subagents on each prepared `prompt.md`, then graded and exported with `export-runs.mjs`.
