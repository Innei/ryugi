# Ryugi for OMP (Oh My Pi)

Complete guide for using Ryugi with OMP (`omp`).

## Installation

Install or link this repository with OMP's native plugin manager:

```bash
omp plugin install https://github.com/Innei/ryugi
```

For a local checkout:

```bash
omp plugin link /path/to/ryugi
```

Verify installation:

```bash
omp plugin list
omp plugin doctor
```

Start a fresh OMP session after installing or updating.

## How It Works

1. The repo-root `package.json` declares `"omp": { "extensions": ["./.omp/extensions/ryugi.ts"], "skills": ["./skills"] }`.
2. `.omp/extensions/ryugi.ts` injects `using-ryugi` + OMP tool mapping as a user-role message on `context` with deduplication and post-compaction re-injection (`session_start`, `session_compact`, `agent_end`, `context`).
3. On `session_start`, and again whenever `/new`, `/resume` or `/fork` moves the process to another session (`session_switch`, `session_branch`), the extension (re)spawns `ryugi-hook watch pi` for the current session (installing `ryugi-hook` in the background if absent, safely invoking `node` rather than `omp.exe`) and delivers browser comments, choice submissions, and document answers directly into the active OMP session via `sendMessage(..., { triggerTurn: true, deliverAs: 'followUp' })`.

## Tool Mapping

See [skills/using-ryugi/references/omp-tools.md](../skills/using-ryugi/references/omp-tools.md).
