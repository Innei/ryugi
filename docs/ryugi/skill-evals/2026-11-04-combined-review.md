# Combined review consumption

2026-11-04. Goal: complete review in one bounded request while retaining separate
state, pagination and evidence acknowledgement rules.

The before consumer read frozen guides without implementation or prior results.
The after consumer used a fresh context and the updated public guides, again
without implementation or prior results. Both supplied concrete commands and
reasoning for document questions, artboard choices and UI verification.

| Scenario                            | Before collection reads | After collection reads |
| ----------------------------------- | ----------------------: | ---------------------: |
| Document threads and asks           |                       2 |                      1 |
| Artboard threads, groups and rounds |                       3 |                      1 |
| Verify groups and comments          |                       2 |                      1 |

These counts describe the delivered first bounded pages. Additional pages still
require their printed continuation. Complete messages are included by --detail,
so an already complete page does not require another Read. Historical --all
pages do not issue receipts; consuming unread evidence requires an eligible
unread complete thread page.

Both consumers kept the submitted-question/round gates and human verification
authority. The after consumer retained older pending/rejected verify groups,
followed each collection's More independently, and did not acknowledge state
collections or historical evidence. An unsupported old cache could not execute
the requested command.

The after consumer identified missing explicit action/cursor/ack grammar in the
public reference. The reference now specifies command argv arrays, per-section
cursor continuation, preserved options and acknowledgement syntax. It also
distinguishes verify/choose groups in the combined response.

Runtime acceptance independently verified one HTTP request, independent More,
exact receipt safety and complete message/JSON metadata retention. Full core
regression passed 240 files / 2154 tests; launcher/hooks/Pi passed 60 tests.

Raw consumer records: /tmp/ryugi-review-efficiency/skill-before.md and
/tmp/ryugi-review-efficiency/skill-after.md. Runtime records and independent code
audit are linked from the companion CLI evaluation report. Fixed observations
do not establish autonomous Agent operation error rates.
