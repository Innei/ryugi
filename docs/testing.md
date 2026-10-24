# Testing Ryugi

Ryugi has two distinct kinds of tests, each in its own directory:

- **`tests/`** — does the plugin's non-LLM code work? Bash + node + python integration tests for OpenCode plugin loading, codex-plugin sync, and analysis utilities.
- **`evals/`** — do agents behave correctly on real LLM sessions? Python harness driving real tmux sessions of Claude Code / Codex / Gemini CLI, with an LLM actor and verifier judging skill compliance.

## Plugin tests

Live in `tests/`. Currently:

- `artifacts/test/` — vitest suite for the artifacts server, scripts, viewer logic, the document LiteXML codec, Loro merge session and comment store, the agent comment route and `comment` command, the `check` command, the server registry and `monitor` (list, view and keys), unread-comment parity between the server and the hook, installing the newest release and the published package contents (`cd artifacts && pnpm test`, which builds first).
- `tests/viewer-release/` — the guard that fails when `artifacts/src/` changed since the last release tag without a version bump.
- `tests/version-bump/` — `bump-version.sh` behavior and that every declared version file, including the viewer's, stays in sync.
- `tests/opencode/` — bash tests for OpenCode plugin loading, bootstrap caching, and tool registration.
- `tests/codex-plugin-sync/` — bash sync verification.
- `tests/hooks/` — the hook scripts: `session-start` bootstrap output (and that starting the artifacts server for projects with published documents never delays it), the Windows `run-hook.cmd` wrapper, the `user-prompt-submit` hook that attaches the open Artboard and document selections, unread comment reminders and auto-publish notices, and the `stop` hook that asks the artifacts server to auto-publish what changed.
- `tests/kimi/` — bash/Python checks for Kimi plugin manifest wiring.
- `tests/claude-code/test-helpers.sh`, `analyze-token-usage.py` — utilities used by remaining bash tests.
- `tests/claude-code/test-worktree-native-preference.sh` — RED-GREEN-REFACTOR validation for worktree skill (quorum covers the PRESSURE phase; bash also covers RED/GREEN baselines).
- `tests/explicit-skill-requests/` — skill-name-prompted trigger tests not covered by quorum.
- `tests/diagnosing-ryugi/test-skill-structure.sh` — structural checks for the diagnosing-ryugi skill (frontmatter, referenced files, leak scan, word budget); behavior-scenario eval records are kept by the maintainer outside the repo.

Run plugin tests via the relevant directory's `run-*.sh` or `npm test`.

## Skill behavior evals

Live in `evals/` (the [superpowers-evals](https://github.com/prime-radiant-inc/superpowers-evals/) eval lab, since renamed from Drill). Quorum is the harness CLI — one part of the system: it drives real coding-agent CLIs through a Gauntlet QA agent and grades them against each scenario's acceptance criteria plus deterministic post-checks. Scenarios live at `evals/scenarios/<name>/`. See `evals/README.md` for setup, the container runtime, and the safety model. Quick start (local break-glass run):

```bash
cd evals
bun install
export RYUGI_ROOT=/path/to/ryugi
bun run quorum run scenarios/triggering-test-driven-development --coding-agent claude
bun run quorum show <run-dir>
```

Quorum scenarios are slow (3-30+ minutes each) and run real LLM sessions in permissive modes — read `evals/README.md`'s Live Eval Risk section first. Only the static gates (`bun run check`, `bun run quorum check`) are safe for public CI; the natural follow-up remains a tiered model (static gates on PR, live sweep nightly + on-demand).
