# Brief consumer fixes: before and after

2026-11-04. Follow-up to the independent evaluation that left five findings open.
The repo-local writing-skills workflow was used before editing the guides.
Before-change evidence comes from plugin 4418f2f0; the after-change reference
consumers used the final working tree and did not read the earlier results.

## Reference-consumer baseline

The first consumer traced three actual entry points: brainstorming artboard
rounds, verifying-ui verdicts and document question submission. It found the
explicit comment list --json instruction, bare-list aggregation assumptions,
and conflicting rules for retiring old verify groups. It could recover by
following the more specific artifacts reference; that does not make the
contradictory upstream instructions correct.

A code-consumer task could only produce placeholder JSONL adapters: the
documents did not name the event discriminator, sequence or result layout and
did not explain foreground ownership versus reuse. This is the before-change
failure for the reference documentation, not a claim that the model always
chose the wrong command.

## Correction and fresh consumption

| Task | Final contract | Independent result |
| --- | --- | --- |
| Continue an artboard round | Brief; read choose groups, associated rounds and complete threads; act on submitted state | Correct commands and gate; page submit was not repeated |
| Read human verification | Independent verify groups and threads; human verdict, without a choice submit requirement | Preserved pass/reject authority and left reject threads open |
| Begin a new verify round | Previously passed groups retire; pending/rejected groups continue to count | Consumer correctly counted old unresolved groups plus new groups |
| Apply question answers | Explicit asks section; every submitted question gets a note, including no-answer questions | Correct handling of draft/submitted/settled/orphan and null answers |
| Consume foreground JSONL | schema/kind/seq on every record; command on meta/ready/result; exact data and cancellation contract | A new code consumer wrote and ran a subscriber from public docs alone |

The fresh reference consumer satisfied all 12 manually reviewed criteria.
A follow-up checked the final doc-rounds and page-answer wording changes.
Generic discussion continues in the terminal; existing page submissions and
verdicts are read without requiring duplicate terminal recording.

This is a reference correction, not a discipline-wording experiment. No claim
is made about multi-model statistical compliance or Token efficiency. Existing
read-only exploration and historical closed-round recovery wording was outside
these output-contract fixes.

## Runtime and automated evidence

A separate real CLI consumer verified Details keeps section, no-comments,
limit and the captured snapshot; partial publication keeps full 347/354-character
login/upgrade URLs and confirmed/failed/not-attempted effects; labelled Brief
records distinguish recommendation true/false, null and zero; later human
comments and Loro changes survive old acknowledgements, including saved diffs.
It retained all 49 command records and separated fixture precondition errors
from accepted cases. Publication used a controlled local HTTP interface.

The docs-only subscriber ran two independent services. Its new foreground
service produced meta/ready/result, stopped on SIGTERM with E_INTERRUPTED and
exit 143. A reused foreground invocation exited 0 with status running; the
same existing URL still returned HTTP 200 afterward. All its own services and
ports were released.

An independent code reviewer also exercised progress/item/result records and
caught an inaccurate claim that command appears on every record. The final
documentation was corrected to the actual protocol before the acceptance run.
The reviewer found no unresolved findings in the final diff.

Final local checks: 240 Artifacts test files / 2142 tests passed, including the
companion fixture; 59 launcher/hook/Pi consumer tests passed, and prompt
injection shell checks passed. Artifacts and Bun type checks and focused Cloud
semantic-read tests passed. Standard pnpm lint passed after the companion CLI
cleared 149 errors; existing warnings remain.

The first broad run had one receipt-read setup failure; its prerequisite now
reports the full wire error before accessing data. It did not reproduce in five
isolated reruns and the final full run passed. A Codex submit fixture also
mistook the first heartbeat for a completed initial scan. The fixture now waits
for the next observed heartbeat before submitting; production startup replay
policy is unchanged. The subsequent 59-test run passed.

Raw local evidence:

- /tmp/ryugi-brief-fixes-skill-before.md
- /tmp/ryugi-brief-fixes-skill-after.md
- /tmp/ryugi-brief-fixes-runtime/REPORT.md and ALL-OUTPUTS.md
- /tmp/ryugi-brief-fixes-jsonl/run-dAbppY/report.json
- /tmp/ryugi-brief-fixes-code-review.md
- /tmp/ryugi-brief-fixes-full-final.log and plugin-tests-final.log

No production Cloud publication, npm release, real billing/login or new clean
harness session is claimed. The companion CLI report records remote CI results.
