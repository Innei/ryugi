# Skill eval: artifacts server resolved to the repository root

Date: 2026-10-24
Change: the CLI resolves `--project-dir` inside a git repository to the repository root, so `start` from `packages/web` prints `"root":"/work/shop/.ryugi/artifacts"`. `skills/artifacts/SKILL.md` "Launching by harness", Claude Code on Windows: one sentence saying where `server-info` sits.
Method: `writing-skills` decision runs, no tools, simulated sessions. The working directory is a subdirectory of `/work/shop`, and `start` was run with that subdirectory as `--project-dir`. Baseline = `SKILL.md` at `main`.

| Scenario                                                                       | Model  | Baseline                                                                 | With change                                             |
| ------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------ | ------------------------------------------------------- |
| HTML artifact: first file to write, right after `start`                        | Sonnet | `/work/shop/.ryugi/artifacts/html/price-slider/index.html` (uses `root`) | not rerun, wording untouched                            |
| Artboard: `canvas.json` and selection path, right after `start`                | Sonnet | both under `/work/shop/.ryugi/artifacts`                                 | not rerun                                               |
| Document: directory, right after `start`                                       | Sonnet | `/work/shop/.ryugi/artifacts/document/rate-limits`                       | not rerun                                               |
| Artboard follow-up several turns after `start`: every file operation           | Sonnet | all 7 under `/work/shop/.ryugi/artifacts`                                | not rerun                                               |
| HTML follow-up several turns after `start`: every file operation               | Haiku  | both under `/work/shop/.ryugi/artifacts`                                 | not rerun                                               |
| Windows foreground, `start` backgrounded and unread: file to read for the link | Sonnet | `C:\work\shop\apps\admin\.ryugi\artifacts\.state\server-info` (wrong)    | `C:\work\shop\.ryugi\artifacts\.state\server-info`      |
| Same                                                                           | Haiku  | not run                                                                  | `C:\work\shop\.ryugi\artifacts\.state\server-info`      |
| Same, outside any git repository (control)                                     | Sonnet | not run                                                                  | `C:\notes\sketches\.ryugi\artifacts\.state\server-info` |

Agents already write under the `root` that `start` prints, so the general path wording (`<project>/.ryugi/artifacts/<type>/<id>/`) stays. Only the Windows paragraph, where the agent reads `server-info` without having seen that output, failed and changed.
