# Artifacts skill: Brief consumption eval

2026-11-04. This checks how an agent uses the CLI reference, rather than checking whether the files contain particular words. The repo-local writing-skills skill was read before this correction. Existing creative-work gates, human decisions, and review-consumption rules were retained.

## Failure and correction

The CLI default was Brief, but the skill examples and notification commands still explicitly selected JSON for a model reading shell output. A sentence saying that JSON was for programmatic use did not overcome the repeated examples.

Two fresh-context baseline consumers read the original skill and supporting guides with the explicit task condition that there was no parser. One planned start/get/publish/check; the other planned comment read/ack, changes, asks, choice groups and rounds. Both chose --format json for ordinary work. One explicitly wrote: “保留文档示例的 --format json，即使消费者是阅读 shell 输出的 LLM。”

The correction gives a positive recipe: read Brief, follow the executable next step, and use complete evidence before acknowledging its exact receipt. Default examples omit format flags; a configured format can be overridden per call with --format brief. Only actual parsers or event subscribers choose JSON/JSONL.

## Consumer reruns

Two new fresh-context consumers received the same ordinary tasks and read the updated reference. Both chose Brief, kept snapshot/project/artifact/receipt inputs by executing the printed commands, and preserved submitted-only answer/round rules. An added programmatic jq task selected JSON; after the public data envelope was stated explicitly, its command used jq -er '.data.url'. That task was a reference-consumption check, not an actual remote publication.

| Scenario                  | Before                                 | After                                                          |
| ------------------------- | -------------------------------------- | -------------------------------------------------------------- |
| Start and share a link    | JSON; inspect data.url                 | Read Open directly; retain the complete Local fallback         |
| Cloud summary and source  | JSON summary/details                   | Brief summary, printed Details/More, pure --source when needed |
| Check readiness           | JSON status/runtime fields             | Read Check, Static, Browser, Pending and warnings              |
| Threads and human edits   | JSON data.items/data.diff/data.receipt | Preview, captured Read, use all evidence, printed Acknowledge  |
| Choice/verify/asks/rounds | JSON as the routine reading mode       | Independent Brief state reads; apply only submitted state      |
| Actual code parser        | JSON expected                          | JSON explicitly selected; use the public data envelope         |

## Running behavior

The notification tests exercise real watcher events and delivered prompts. Their emitted agent commands now select Brief; the prompt-injection shell suite also checks its actual output. The startup hook still parses JSON internally, and its existing tests remain part of the run.

A fresh runtime consumer completed 24 CLI calls: 20 successful calls, two expected publish human-action exits, and two synthetic get probes outside the real read policy. The latter were not counted as product defects or authentication coverage. No CLI output was parsed as JSON. Fixture HTTP APIs used JSON normally.

The consumer ran a real local artifacts server and local fake Cloud. It followed the exact printed thread Read/Acknowledge commands and confirmed a later reply remained unread. Two actual Loro human updates completed with HTTP 204; the later diff survived ack of the earlier captured diff. It read submitted asks, choice/recommendation/round context, verify rejection state and round group membership directly from Brief. Publish login and quota failures displayed full login/upgrade URLs with exit 2.

The run exposed a choose-summary bug (unknown). A failing store behavior test reproduced it, the summary was corrected to chosen/empty, and the independent consumer restarted the final bundle and observed chosen:1. Both servers were stopped afterward.

Runtime boundaries: no browser, large diff/save, pagination, withdrawn/staleChoice/orphan, byRecommendation=true or real Cloud account was tested in this live consumer pass. The recommendation=true and summary cases are covered by focused automated behavior tests. Raw local evidence was retained at /tmp/ryugi-brief-skill-eval-RrD011 during this session.

New behavior regressions first failed for missing login details, missing local fallback, omitted choice/round context, and unknown choice summaries. The shared Renderer and domain facts were fixed rather than telling the agent to switch back to JSON.

Commands used for repository checks:

```bash
node --test tests/artifacts-output/launcher.test.cjs tests/hooks/test-comment-watch.cjs tests/hooks/test-start-artifacts.cjs tests/hooks/test-codex-comment-watch.cjs tests/pi/test-pi-extension.mjs
bash tests/hooks/test-user-prompt-submit.sh
```

These passed: 59 Node tests and all prompt-injection shell cases. The companion Artifacts implementation report records the final package suite and type checks. No new harness bootstrap, production Cloud deployment, npm publication, or token-efficiency benchmark is claimed.
