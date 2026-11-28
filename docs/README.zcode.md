# Artideck for ZCode

Complete guide for using Artideck (`adeck`) with ZCode (`zcode`).

## Installation

Add this repository as a local marketplace and install `adeck`:

```bash
zcode plugins marketplace add /path/to/artideck
zcode plugins install adeck@ryugi-dev
```

Verify installation:

```bash
zcode plugins list
zcode skills list
```

Start a fresh ZCode session after installing or updating.

## How It Works

1. `.zcode-plugin/plugin.json` declares the bundled `skills/` directory (`adeck:*` skills).
2. ZCode loads the root `hooks/hooks.json`, firing `SessionStart` (`startup|clear|compact`), `UserPromptSubmit`, `Stop`, and tool event hooks.
3. `hooks/session-start` matches `ZCODE_PLUGIN_ROOT` before `CLAUDE_PLUGIN_ROOT`, injecting `skills/using-adeck/SKILL.md` together with `skills/using-adeck/references/zcode-tools.md` via `hookSpecificOutput.additionalContext`.

## Tool Mapping

See [skills/using-adeck/references/zcode-tools.md](../skills/using-adeck/references/zcode-tools.md).
