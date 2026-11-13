# Agent-friendly CLI skill migration

2026-11-13: baseline released 1.76.0 CLI/skill versus the independently installed candidate CLI and migrated skill. Codex CLI 0.167.2, gpt-6.1-sol, medium, five samples per arm per task. Both arms completed 10/10 tasks.

| Task                                                       | Median total tokens        | Tool calls |
| ---------------------------------------------------------- | -------------------------- | ---------- |
| Apply comments, reply, resolve, acknowledge                | 184,212 → 113,206 (−38.5%) | 11 → 10    |
| Create a document with a native flow and unanswered choice | 104,189 → 82,632 (−20.7%)  | 5 → 5      |

All baseline runs read a format file; no candidate run did. Neither arm searched development source. The independent state audit also checked actual reply descriptions and all three diagram stages: 20/20. Complete-file grammar, ID preservation and unanswered human state were checked against actual files/server state. Failed CLI calls were retained (baseline comments 2, candidate 0).

The skill now preserves purpose, type choice, human decisions, edit preservation and a few normal calls. Formats and examples come from the CLI package's normal entry/help. At this evaluation snapshot, the old reference filenames remained small compatibility pointers; the later [single-entry cleanup](../2026-11-13-artifacts-single-entry/README.md) removes them. Other workflow skills point at that same authoring source. A missing module vocabulary also returns its complete writing description.

This measures the whole entry experience, including CLI changes. Reference-read count is diagnostic, not a correctness gate. Five samples are preliminary. No elapsed-time improvement was demonstrated: comments 54.0s → 59.5s, creation 43.6s → 57.4s. Concurrent test/build load and sequential arm order limit timing comparisons.

[Machine-readable before/after results](summary.json) include every sample, hashes and failures. Raw JSONL/prompts/XML/state are retained in the sibling ryugi-cloud checkout at docs/ryugi/cli-evals/2026-11-13-agent-friendly/runs/. Reproduction tools and full test/baseline notes are in that checkout's packages/artifacts/eval/agent-cli/ and docs/ryugi/cli-evals/2026-11-13-agent-friendly/report.md.

The new skill requires the CLI writing-context implementation. These are local changes; no plugin/npm release is included. Publish the artifacts package before releasing the migrated skill.
