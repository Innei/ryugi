# Ryugi 流儀

Ryugi (りゅうぎ, "one's own way of doing things") is a software development workflow for coding agents: a small set of composable skills plus a bootstrap that makes sure your agent uses them. It started as a fork of [Superpowers](https://github.com/obra/superpowers) and was reshaped around one workflow: brainstorm with mockups, approve a spec, build it inline under TDD.

## Table of Contents

- [How it works](#how-it-works)
- [Getting Started](#installation)
  - [Claude Code](#claude-code)
  - [Antigravity](#antigravity)
  - [Codex, Cursor](#codex-cursor)
  - [Devin CLI](#devin-cli)
  - [Factory Droid](#factory-droid)
  - [Gemini CLI](#gemini-cli)
  - [Kimi Code](#kimi-code)
  - [OpenCode](#opencode)
  - [Pi](#pi)
  - [Qwen Code](#qwen-code)
  - [Hermes Agent](#hermes-agent)
  - [Muse](#muse)
- [The Basic Workflow](#the-basic-workflow)
- [Credits](#credits)
- [What's Inside](#whats-inside)
- [Philosophy](#philosophy)
- [Contributing](#contributing)
- [Updating](#updating)
- [License](#license)

## How it works

It starts from the moment you fire up your coding agent. As soon as it sees that you're building something, it *doesn't* just jump into trying to write code. Instead, it steps back and asks you what you're really trying to do. 

Once it's teased a spec out of the conversation, it shows it to you in chunks short enough to actually read and digest. 

When it helps to see things, it opens the Artboard: a canvas in your browser with mockup variants side by side, so you can point at the one you want.

After you've signed off on the design, it asks one question: build it inline from the spec, or just code it. Inline, your agent slices the spec into tasks itself, proves each one with true red/green TDD, keeps a ledger of every judgment call it made on your behalf, and gets one fresh review of the whole branch at the end. It's not uncommon for your agent to work autonomously for a couple hours at a time without stopping to ask "should I continue?".

There's a bunch more to it, but that's the core of the system. And because the skills trigger automatically, you don't need to do anything special. Your coding agent just has Ryugi.

## Installation

Ryugi is not listed in any harness's official marketplace; install it from this repository. If you use more than one harness, install it in each.

### Claude Code

- Register this repository as a marketplace:

  ```bash
  /plugin marketplace add Innei/ryugi
  ```

- Install the plugin:

  ```bash
  /plugin install ryugi@ryugi-dev
  ```

### Antigravity

Install Ryugi as a plugin from this repository:

```bash
agy plugin install https://github.com/Innei/ryugi
```

Antigravity lists each installed skill's description, and the description of
the `using-ryugi` skill prompts the model to load that skill at the start
of a conversation. Reinstall with the same command to update.

### Codex, Cursor

The repository carries the manifests (`.codex-plugin/`, `.agents/plugins/marketplace.json`, `.cursor-plugin/`), but Ryugi is not in either official marketplace. Add this repository as a local plugin source following your harness's plugin docs.

### Devin CLI

- Install the plugin from this repository:

  ```bash
  devin plugins install Innei/ryugi
  ```

- Update to the latest version with:

  ```bash
  devin plugins update ryugi
  ```

### Factory Droid

- Register the marketplace:

  ```bash
  droid plugin marketplace add https://github.com/Innei/ryugi
  ```

- Install the plugin:

  ```bash
  droid plugin install ryugi@ryugi
  ```

### Gemini CLI

- Install the extension:

  ```bash
  gemini extensions install https://github.com/Innei/ryugi
  ```

- Update later:

  ```bash
  gemini extensions update ryugi
  ```

### Kimi Code

- Install directly from this repository:

  ```text
  /plugins install https://github.com/Innei/ryugi
  ```

- Detailed docs: [docs/README.kimi.md](docs/README.kimi.md)

### OpenCode

OpenCode uses its own plugin install; install Ryugi separately even if you
already use it in another harness.

- Tell OpenCode:

  ```
  Fetch and follow instructions from https://raw.githubusercontent.com/Innei/ryugi/refs/heads/main/.opencode/INSTALL.md
  ```

- Detailed docs: [docs/README.opencode.md](docs/README.opencode.md)

### Pi

Install Ryugi as a Pi package from this repository:

```bash
pi install git:github.com/Innei/ryugi
```

For local development, run Pi with this checkout loaded as a temporary package:

```bash
pi -e /path/to/ryugi
```

The Pi package loads the Ryugi skills and a small extension that injects the `using-ryugi` bootstrap at session startup and again after compaction. Pi has native skills, so no compatibility `Skill` tool is required. Subagent and task-list tools remain optional Pi companion packages.

### Qwen Code

Qwen Code installs plugins from Claude Code marketplaces directly.

- Install the plugin from this repository, and pick `ryugi` when prompted:

  ```bash
  qwen extensions install Innei/ryugi
  ```

- Update later:

  ```bash
  qwen extensions update ryugi
  ```

### Hermes Agent

Install Ryugi as a Hermes plugin from this repository:

```bash
hermes plugins install Innei/ryugi --enable
```

Restart any active Hermes sessions after installing. Note: Hermes has no
post-compaction hook, so a very long session that compacts over its first
turn loses the bootstrap — start a fresh session if skills stop triggering.

### Muse

Ryugi is available as a native Muse plugin — same repo, same skills, all harnesses. The `using-ryugi` bootstrap is injected via the native `SessionStart` hook alongside Claude Code, Codex, Cursor, Gemini, Pi, and the rest — no per-session opt-in.

- Install from a local checkout:

  ```bash
  muse plugins install ./
  muse plugins approve ryugi
  ```

  Or clone and install:

  ```bash
  git clone https://github.com/Innei/ryugi.git
  muse plugins install ./ryugi
  muse plugins approve ryugi
  ```

- Update later:

  ```bash
  muse plugins update ryugi
  ```

Restart any active Muse sessions after installing so the `SessionStart` hook takes effect — skills are active immediately, hooks require approval on first install. To verify, start a fresh session and send `Let's make a react todo list` — a working install auto-triggers `brainstorming` before any code is written. Version is tracked in `.version-bump.json` so `scripts/bump-version.sh` keeps it in sync.

## The Basic Workflow

1. **brainstorming** - Activates before building anything. Draws out what you actually want, and why, through questions that get you describing it, then plays its understanding back for correction. Shows mockups on the Artboard when seeing beats reading. Small changes get agreed in chat; projects get a written design document a builder could build from.

2. **executing-specs** - Activates when you approve the spec and choose inline. Slices the spec into tasks, implements each under TDD with a ledger that survives compaction, records every judgment call as a ruling, gets one fresh review of the whole branch, then stops and reports. Shipping stays yours.

3. **test-driven-development** - Activates during implementation. Enforces RED-GREEN-REFACTOR: write failing test, watch it fail, write minimal code, watch it pass, commit.

4. **systematic-debugging** - Activates on a bug or unexpected behavior. Root cause before fixes.

5. **using-git-worktrees** - Activates when you want isolation. Follows your stated preference; asks when there is none.

**Your project's own skills come first at their step** — a design system before mockups, a verify skill before reporting, a ship skill for merging. Ryugi sets the process; your project carries its domain.

**The agent checks for relevant skills before any task.** Mandatory workflows, not suggestions.

## Credits

Ryugi is a fork of [Superpowers](https://github.com/obra/superpowers) by Jesse Vincent and [Prime Radiant](https://primeradiant.com), used under the MIT License. The skill design, the TDD and debugging disciplines, and most of the harness integrations come from there.

- **Issues**: https://github.com/Innei/ryugi/issues

## What's Inside

### Skills Library

**Process**
- **brainstorming** - Drawing out intent before building, with the Artboard for mockups
- **executing-specs** - Build an approved spec inline: one context, one ledger, one final review

**Discipline**
- **test-driven-development** - RED-GREEN-REFACTOR cycle (includes testing anti-patterns reference)
- **systematic-debugging** - 4-phase root cause process (includes root-cause-tracing, defense-in-depth, condition-based-waiting techniques)

**Workspace**
- **using-git-worktrees** - Isolated workspaces, and cleaning them up

**Meta**
- **using-ryugi** - Introduction to the skills system, plus evidence before claims

`writing-skills` (creating and testing skills) lives in this repo at `.claude/skills/writing-skills/` and loads only when you work on Ryugi itself.

## Contributing

1. Fork the repository and create a branch
2. Follow the repo-local `writing-skills` skill (`.claude/skills/writing-skills/SKILL.md`) for creating and testing new and modified skills
3. Open a PR against `main`, filling in the pull request template

Plugin-infrastructure tests live at `tests/` and run via the relevant `run-*.sh` or `npm test`.

## Updating

Ryugi updates are somewhat coding-agent dependent, but are often automatic.

## License

MIT License - see LICENSE file for details
