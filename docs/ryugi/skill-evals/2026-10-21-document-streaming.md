# Skill eval: show document drafts earlier

Date: 2026-10-20–21. Model: `deepseek/deepseek-v4-pro`, thinking `low`.
Harness: OMP CLI 18.9.1, using its configured provider and credentials.
The standalone DeepSeek CLI was not used for these results.

## Method

Each run used a fresh disposable project, the complete artifacts `SKILL.md`,
and either the unchanged `document.md` or a candidate reference. A real
artifacts server watched `doc.xml`, parsed intermediate files, stamped block
ids and merged edits through Loro. OMP could use `read,write,edit,bash`.
Extensions, automatic skills and LSP were disabled so unrelated project
instructions could not change the experiment. This evaluates the writing
reference, not automatic skill discovery or harness integration.

The shared task requested a Chinese offline-sync design with six sections
(背景、目标、协议、冲突、恢复、验收), two substantive paragraphs per section,
a comparison table and pseudocode. It had to cover monotonic `seq`,
idempotency and snapshot fallback after seven offline days. New-document
prompts explicitly asked to start reading before writing finished.

Three scenarios per reference:

- New document: check the first valid saved version, intermediate validity
  and complete final content.
- Resume: retain the confirmed background paragraph verbatim, original ids
  and a human comment while completing the remaining sections.
- Concurrent edit: after the first model change, submit a real CRDT update
  through the browser update API, changing a human rollback decision from
  1% to 2%. Check the updated text, original ids and comment anchor/message.

The initial nine runs used zero animation delay to isolate model behavior.
The final reference used the production 35 ms animation delay and waited for
streaming to settle before checking the result. Watcher debounce was 20 ms
and autosave delay 10 ms throughout. Times below are individual samples,
not a benchmark or an estimate of expected latency. “First” means the first
valid saved document with headings, not a measured browser paint.

Three early pilots lacking the complete reference/context were excluded.
Two later new-document concurrency fixtures were also excluded: one tried
to anchor a comment before ids had been stamped; another wrote a human
message through the agent file boundary, which the server correctly rejected.
The final fixture waits for ids and creates the comment through the browser
API. These fixture failures are not counted as model failures.

## Before and after

| Reference / scenario                  | First saved draft | Agent finished | Tool calls | Observed behavior                                                        |
| ------------------------------------- | ----------------: | -------------: | ---------: | ------------------------------------------------------------------------ |
| Baseline / new                        |            82.1 s |         90.8 s |         10 | First save contained the complete document                               |
| Baseline / resume                     |          existing |        115.7 s |         11 | Confirmed text, ids and comment retained                                 |
| Baseline / concurrent                 |          existing |         82.6 s |         16 | Human update, ids and comment retained                                   |
| V1 / new                              |            60.3 s |        124.2 s |         18 | Outline, then six distinct section additions                             |
| V1 / resume                           |          existing |         80.1 s |          8 | Confirmed text, ids and comment retained                                 |
| V1 / concurrent                       |          existing |         60.1 s |         14 | Six edits grouped in one assistant turn; human update retained           |
| V2 / new                              |            28.1 s |         69.8 s |          9 | Outline, then a whole-file body write; outline ids lost                  |
| V2 / resume                           |          existing |         44.6 s |          7 | Confirmed text, ids and comment retained                                 |
| V2 / concurrent                       |          existing |         70.7 s |         16 | Separate section edits without intervening reads; human update retained  |
| V3 / new                              |            14.4 s |         46.0 s |         10 | Outline, then body; heading ids retained                                 |
| V3 / resume                           |          existing |         66.9 s |          8 | Confirmed text, ids and comment retained                                 |
| V3 / concurrent                       |          existing |         61.3 s |         16 | Human update, ids and comment retained                                   |
| V3 / new with concurrent edit/comment |     outline first |         53.1 s |         13 | Newly stamped ids, human update and live comment anchor/message retained |

V1 added an outline-first sequence and asked for section edits with reads
and warning checks between them. V2 made that a numbered read/edit/check
cycle. Neither reliably produced that cycle. V1's new-document run added
sections separately, but did not reread between them. V2's new-document
run ignored the cycle and wrote the full body in one call.

All twelve runs ended with valid XML, all six completed sections and no
server warnings. Every pre-existing human decision, confirmed paragraph,
id and comment survived. That does **not** mean every newly created outline
id survived: V2 rewrote and numbered the headings without keeping ids,
replacing all seven heading ids. The original `idsPreserved` metric only
covered ids present before the run; comparing intermediate snapshots
exposed this additional failure. No claim of universal id safety follows
from those result fields.

V3 removed the mandatory per-section tool cycle. It retained outline-first,
existing read/id/warnings rules, preservation of completed sections on
resume, and the requirement to finish the body. Even then, the ordinary
new-document run did not reread immediately after the outline. Prompting
alone did not make every safety instruction reliably followed.

The final additional pressure run created a human comment through the
browser comments API immediately after the outline received ids, and
edited its introduction through the CRDT update API. The model subsequently
reread the current file before writing the body. The human text, all ids
captured from the outline, and the comment's original message and live
anchor survived. Streaming settled after 53.8 s with no warnings.

Decision: ship V3's outline-first guidance, without requiring one tool call
per section. It improves early availability in these samples while keeping
the existing node-by-node viewer playback. V1/V2's strict tool cycle is not
adopted; it was neither reliable nor consistently faster. Safety checks are
still instructions to the model, not an enforced transaction protocol.

## Streaming overlap regression

Replayed V1's seven content stages through a real document session at the
production 35 ms step delay, submitting cumulative versions 150 ms apart.
An independent CRDT peer also edited the introduction while streaming.

Before the fix, queued versions selected merge bases before earlier queued
writes were available. Later paragraphs appeared repeatedly: the first
goal paragraph appeared five times. The human introduction edit survived,
so checking only human retention would have missed the corruption.

Queued edits now use the preceding accepted agent file version; autosaves
are suspended while streaming, so intervening human changes are not part
of that on-disk base. The frontier is resolved when the queued edit runs,
after its predecessor has been imported. Idle edits retain the existing
stale-copy merge-base selection.

After the fix, the same replay produced exactly the intended final text
plus the human addition: seven stages, 254 update/cursor steps, overlapping
streams, 10.8 s playback, no duplicate paragraphs, and an idle final cursor.
A small regression test also covers three queued versions, including a
revision to a newly added paragraph, and a simultaneous human edit.

## Evidence and limits

- Document metadata, caret, editing status and waiting-for-agent comment
  badges use the same existing `commentNames().agent()` / `detectAgent`
  identity as the Artboard. Unknown agents retain the `Agent` fallback;
  historical comment authors retain their recorded names.
- Regression tests first failed for missing detected labels/API metadata,
  waiting badges, and duplicate queued paragraphs. The final core artifact
  run passed 488 tests in 45 files. `pnpm typecheck`, `pnpm build` and
  `git diff --check` passed.
- CLI/launcher/lifecycle suites were excluded from that core run. Earlier
  full-suite attempts hit the pre-existing CLI `stale_pid` versus `stopped`
  failure and did not complete; this is not a clean full-suite result.

Local raw OMP JSONL, prompts, intermediate XML, tool calls and per-run
results are retained under `.ryugi/evals/document-streaming-20261020/`.
They contain synthetic tasks, not production documents. `baseline.md`,
`candidate-v1.md`, `candidate-v2.md` and `candidate.md` preserve the exact
reference variants. The eval/replay sources are kept there as well.

The OMP command was:

```sh
omp --cwd "$project" --model deepseek/deepseek-v4-pro --thinking low \
  --no-extensions --no-skills --no-lsp --no-title --no-prewalk --no-session \
  --tools read,write,edit,bash --auto-approve --mode json --max-time 8m \
  --print "$prompt"
```

Some runs recovered from looking for warnings at the wrong path. A final
empty warning list measures server acceptance; it does not prove the model
waited for every intermediate animation or read fresh warnings each time.
These small samples do not establish compliance rates, content quality
across other tasks, other models, or general conflict-free collaboration.
