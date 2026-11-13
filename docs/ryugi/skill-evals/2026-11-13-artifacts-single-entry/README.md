# Artifacts single entry cleanup

2026-11-13. Removed the ten compatibility pointer files under skills/artifacts. The normal entry and an executable type-help example live in SKILL.md. Complete formats stay owned by the installed CLI. Existing human decisions, permissions, preservation and receipt rules are unchanged.

## Before and after

Both arms used the same published ryugi-artifacts@1.77.0 binary and grader, Codex CLI 0.167.2, gpt-6.1-sol, medium. Baseline was captured from 5a6b1320 before editing. Candidate was captured after removing the files and formatting SKILL.md. Each arm ran one actual codex exec in an isolated temporary project, with no browser or Cloud publication.

| Arm    | Native document + diagram + human choice | Tool calls | Reference-file reads | Source fallback |
| ------ | ---------------------------------------- | ---------- | -------------------- | --------------- |
| Before | passed                                   | 6          | 0                    | 0               |
| After  | passed                                   | 6          | 0                    | 0               |

The file, parsed diagram stages, clean check and draft human question were checked against actual output/server state. Both already followed the CLI entry. This is a cleanup regression check with one sample per arm; it makes no new token or timing claim. There was no baseline agent failure that would justify adding a new behavioral prohibition.

[Observed results and checks](summary.json) and [fixed inputs](manifest.json) retain the hashes and commands. Raw prompts, JSONL, stderr, XML and state remain in ignored runs/. The runner is the sibling ryugi-cloud packages/artifacts/eval/agent-cli/run.mjs; set RYUGI_AGENT_EVAL_DIR to a fresh manifest with both arms pointing to the same installed 1.77.0 package and to the before/after skill snapshots.

## Verification

- All five artifact type-help commands return their embedded writing information without creating project files: type-help-check.log.
- Launcher, Codex manifest and marketplace checks exercise the actual remaining entrypoint.
- The archive test found an existing timezone issue: HEAD packaging in Asia/Singapore stores the 1980 ZIP epoch at 07:30, while the test expects 00:00. Running the unchanged script with TZ=UTC passes. The before-cleanup source was packaged in that initial run; no timestamp code was changed here. Raw failure is retained in package-check-asia-singapore.log.
- Current skills, hooks, tests and public docs have no references to the removed filenames. Historical design specs and old eval snapshots retain their original wording.
