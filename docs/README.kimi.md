# Artideck for Kimi Code

Complete guide for using Artideck with [Kimi Code](https://github.com/MoonshotAI/kimi-code).

## Installation

Artideck is available in Kimi Code's plugin marketplace.

Open the plugin manager:

```text
/plugins
```

Go to `Marketplace` > `ryugi` and install it.

You can also install from this repository:

```text
/plugins install https://github.com/Innei/artideck
```

For unreleased validation against `dev`, pin the branch explicitly:

```text
/plugins install https://github.com/Innei/artideck/tree/dev
```

Kimi Code applies plugin changes to new sessions. After installing, updating, enabling, disabling, or reloading a plugin, start a fresh session with `/new`.

## How It Works

The Kimi plugin manifest lives at `.kimi-plugin/plugin.json`.

The manifest does three things:

1. Points Kimi Code at the existing `skills/` directory.
2. Loads `using-adeck` at session start through `sessionStart.skill`.
3. Provides Kimi-specific tool mapping through `skillInstructions`.

Kimi Code reads Artideck skills from this repository. There are no copied skills, symlinks, hooks, or extra runtime dependencies.

## Tool Mapping

Skills describe actions instead of hard-coding one runtime's tool names. On Kimi Code these resolve to:

- "Ask the user" / "ask clarifying questions" -> `AskUserQuestion`
- "Create a todo" / "mark complete in todo list" -> `TodoList`
- "Dispatch a subagent" -> `Agent`
- "Invoke a skill" -> Kimi Code's native `Skill` tool
- "Read a file" / "write a file" / "edit a file" -> `Read`, `Write`, `Edit`
- "Run a shell command" -> `Bash`
- "Search file contents" -> `Grep`
- "Find files by path or pattern" -> `Glob`
- "Fetch a URL" -> `FetchURL`
- "Search the web" -> `WebSearch`

## Updating

Use Kimi Code's plugin manager:

```text
/plugins
```

Select `ryugi` and update it from there. Start a fresh session with `/new` after updating.

## Troubleshooting

### Plugin not loading

1. Run `/plugins info ryugi` and check diagnostics.
2. Make sure the plugin is enabled.
3. Start a fresh session with `/new` after install or update.

### Direct GitHub install used an old release

Kimi Code installs the latest GitHub release for a bare repository URL when one exists. To test unreleased changes before the next Artideck release, install the branch explicitly:

```text
/plugins install https://github.com/Innei/artideck/tree/dev
```

### Skills not triggering

1. Confirm `/plugins info ryugi` shows the plugin enabled.
2. Start a fresh session with `/new`.
3. Try the acceptance prompt: `Let's make a react todo list`. A working install should start `brainstorming` before writing code, opening an artboard of directions where artifacts can run.
