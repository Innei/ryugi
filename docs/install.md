# Installing Ryugi

Ryugi is not listed in any harness's official marketplace; install it from this
repository. If you use more than one harness, install it in each.

The bootstrap (`using-ryugi`) is what makes the skills fire on their own. The
acceptance test is the same everywhere: open a clean session and send

> Let's make a react todo list

A working install triggers `brainstorming` before any code is written.

## Claude Code

```bash
/plugin marketplace add Innei/ryugi
/plugin install ryugi@ryugi-dev
```

## Antigravity

```bash
agy plugin install https://github.com/Innei/ryugi
```

Antigravity lists each installed skill's description, and the description of the
`using-ryugi` skill prompts the model to load that skill at the start of a
conversation. Reinstall with the same command to update.

## Codex, Cursor

The repository carries the manifests (`.codex-plugin/`,
`.agents/plugins/marketplace.json`, `.cursor-plugin/`), but Ryugi is not in
either official marketplace. Add this repository as a local plugin source
following your harness's plugin docs.

## Devin CLI

```bash
devin plugins install Innei/ryugi
devin plugins update ryugi   # update later
```

## Factory Droid

```bash
droid plugin marketplace add https://github.com/Innei/ryugi
droid plugin install ryugi@ryugi
```

## Gemini CLI

```bash
gemini extensions install https://github.com/Innei/ryugi
gemini extensions update ryugi   # update later
```

## Kimi Code

```text
/plugins install https://github.com/Innei/ryugi
```

Full guide: [README.kimi.md](README.kimi.md).

## OpenCode

OpenCode uses its own plugin install; install Ryugi separately even if you
already use it in another harness.

```text
Fetch and follow instructions from https://raw.githubusercontent.com/Innei/ryugi/refs/heads/main/.opencode/INSTALL.md
```

Full guide: [README.opencode.md](README.opencode.md).

## Pi

```bash
pi install git:github.com/Innei/ryugi
```

For local development, run Pi with a checkout loaded as a temporary package:

```bash
pi -e /path/to/ryugi
```

The Pi package loads the Ryugi skills and a small extension that injects the
`using-ryugi` bootstrap at session startup and again after compaction. Pi has
native skills, so no compatibility `Skill` tool is required. Subagent and
task-list tools remain optional Pi companion packages.

## Qwen Code

Qwen Code installs plugins from Claude Code marketplaces directly. Pick `ryugi`
when prompted.

```bash
qwen extensions install Innei/ryugi
qwen extensions update ryugi   # update later
```

## Hermes Agent

```bash
hermes plugins install Innei/ryugi --enable
```

Restart any active Hermes sessions after installing. Hermes has no
post-compaction hook, so a very long session that compacts over its first turn
loses the bootstrap — start a fresh session if skills stop triggering.

## Muse

```bash
muse plugins install ./
muse plugins approve ryugi
muse plugins update ryugi   # update later
```

`muse plugins install ./ryugi` after a clone works the same way. Restart any
active Muse sessions so the `SessionStart` hook takes effect — skills are active
immediately, hooks require approval on first install. Version is tracked in
`.version-bump.json` so `scripts/bump-version.sh` keeps it in sync.

## Writing a new integration

See [porting-to-a-new-harness.md](porting-to-a-new-harness.md).
