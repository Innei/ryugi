# Artideck for DeepSeek Harness (DSH)

Complete guide for using Artideck with DeepSeek Harness (`dsh`).

## Installation

Install the bundled Cordis plugin package (`.dsh/`) into your DSH profile:

```bash
dsh plugin --profile <profile> add github:Innei/artideck#path:.dsh # install the latest version of main branch
dsh plugin --profile <profile> add github:Innei/artideck#<tag name|branch name>&path:.dsh # install from a specific branch or tag
```

Also, you can clone this repo and install the bundle with:

```bash
dsh plugin --profile <profile> add link:/path/to/ryugi/.dsh
```

Ensure `"dsh-plugin-ryugi"` is listed in `dsh.profile.bundles` in `~/.dsh/profiles/<profile>/package.json`, then restart or reload DSH.

Verify merged Cordis config:

```bash
dsh --profile headless --dump-config | grep -A 3 "dsh-plugin-ryugi"
```

## How It Works

1. `.dsh/package.json` declares `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`, registering the `dsh-plugin-ryugi` Cordis plugin.
2. `.dsh/index.mjs` registers a Cordis `skills` provider exposing all bundled skills under `skills/` as kebab-case `ryugi-<name>` entries for DSH's native `skill` tool.
3. On `agent/pre-step`, it injects `using-ryugi` + DSH tool mapping once as a user-role message for top-level sessions, deduplicating against `session.deriveMessages()` so compaction automatically triggers re-injection.
4. For projects with `.artideck/artifacts/`, it opens an Artideck Hub channel and delivers browser comments and choice submissions directly to the session via `agent.followup` / `agent.inject`.

## Tool Mapping

See [skills/using-ryugi/references/dsh-tools.md](../skills/using-ryugi/references/dsh-tools.md).
