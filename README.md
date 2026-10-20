<p align="center">
  <img src="assets/logo/ryugi.png" width="208" alt="Ryugi">
</p>

<h1 align="center">Ryugi 流儀</h1>

<p align="center">Brainstorm with mockups. Approve a spec. Build it inline under TDD.</p>

Ryugi (りゅうぎ, "one's own way of doing things") is a software development workflow for coding agents: a few composable skills plus a bootstrap that makes sure your agent uses them. It started as a fork of [Superpowers](https://github.com/obra/superpowers) v7.0.0 and was reshaped around a single workflow.

## How it works

Your agent doesn't jump into code. It asks what you're really trying to do, pulls a spec out of the conversation, and plays it back in chunks short enough to read.

When seeing beats reading, it opens a local artifact: a document for architecture, reviews and proposals; an artboard to compare mockups across several dimensions; or one HTML page — a test bench with sliders, a focused design study — that updates live as the agent rewrites it. HTML artifacts can use a bundled Web Component kit (Lobe UI buttons, inputs, sliders, switches, cards) so a test bench looks like the product and keeps its settings across rewrites. Everything runs locally; no subscription.

```mermaid
flowchart LR
  I[Idea] --> B[brainstorming]
  B --> A[artifacts<br/>artboard · document · html]
  A --> S[Approved spec]
  S --> E[executing-specs]
  E --> T[per-task TDD]
  T --> R[one fresh review] --> L[you land it]
```

After you sign off, it asks one question: build it inline from the spec, or just code it. Inline, your agent slices the spec into tasks, proves each with true red/green TDD, keeps a ledger of every judgment call across compaction, gets one fresh review of the whole branch, then reports how to land it — squash (default), rebase, PR, or keep. Never a merge commit.

Two-hour autonomous stretches without "should I continue?" are normal. Because the skills trigger automatically, there is nothing to invoke.

## Install

Install from this repository; Ryugi is in no harness's official marketplace. If you use several harnesses, install it in each. [docs/install.md](docs/install.md) has update commands, caveats, and per-harness detail.

| Harness | Command |
|---|---|
| Claude Code | `/plugin marketplace add Innei/ryugi` then `/plugin install ryugi@ryugi-dev` |
| Antigravity | `agy plugin install https://github.com/Innei/ryugi` |
| Codex, Cursor | Add this repo as a local plugin source ([detail](docs/install.md#codex-cursor)) |
| Devin CLI | `devin plugins install Innei/ryugi` |
| Factory Droid | `droid plugin marketplace add https://github.com/Innei/ryugi` then `droid plugin install ryugi@ryugi` |
| Gemini CLI | `gemini extensions install https://github.com/Innei/ryugi` |
| Kimi Code | `/plugins install https://github.com/Innei/ryugi` |
| OpenCode | [.opencode/INSTALL.md](.opencode/INSTALL.md) |
| Pi | `pi install git:github.com/Innei/ryugi` |
| Qwen Code | `qwen extensions install Innei/ryugi` |
| Hermes Agent | `hermes plugins install Innei/ryugi --enable` |
| Muse | `muse plugins install ./` then `muse plugins approve ryugi` |

Verify with a clean session: send `Let's make a react todo list`. A working install triggers `brainstorming` before any code is written.

## The workflow

1. **brainstorming** — activates before building anything. Draws out what you actually want and why, then plays its understanding back for correction. Small changes get agreed in chat; projects get a design document a builder could build from.
2. **executing-specs** — activates when you approve the spec and choose inline. Slices the spec into tasks, implements each under TDD with a ledger that survives compaction, records every judgment call as a ruling, gets one fresh review, then stops and reports.
3. **test-driven-development** — activates during implementation. RED-GREEN-REFACTOR: failing test, watch it fail, minimal code, watch it pass, commit.
4. **systematic-debugging** — activates on a bug or unexpected behavior. Root cause before fixes.
5. **using-git-worktrees** — activates when you want isolation. Follows your stated preference; asks when there is none.
6. **artifacts** — activates when something is clearer to look at than to read, in brainstorming or anywhere else. Artboards, live HTML pages, and a bundled Web Component kit, each at its own local link.

**Your project's own skills come first at their step** — a design system before mockups, a verify skill before reporting, a ship skill for merging. Ryugi sets the process; your project carries its domain.

## What's inside

- **Process** — `brainstorming`, `artifacts`, `executing-specs`
- **Discipline** — `test-driven-development`, `systematic-debugging`
- **Workspace** — `using-git-worktrees`
- **Meta** — `using-ryugi` (bootstrap, plus evidence before claims)

`writing-skills` — creating and testing skills — lives at `.claude/skills/writing-skills/` and loads only when you work on Ryugi itself.

## Credits

Ryugi is a fork of [Superpowers](https://github.com/obra/superpowers) v7.0.0 by Jesse Vincent and [Prime Radiant](https://primeradiant.com), used under the MIT License. [UPSTREAM.md](UPSTREAM.md) records the baseline and how to port upstream changes. The skill design, the TDD and debugging disciplines, and most harness integrations come from there.

Bug reports and ideas: [Issues](https://github.com/Innei/ryugi/issues). Contributions: fork, branch, follow the repo-local `writing-skills` skill, open a PR against `main` with the template filled in. Plugin infrastructure tests live in `tests/`; [docs/testing.md](docs/testing.md) lists what each suite covers.

## License

MIT — see [LICENSE](LICENSE).
