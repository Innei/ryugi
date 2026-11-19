---
name: isolated-agent-eval
description: Use when an unattended agent session in a test could act on Ryugi Cloud — publish, auto-publish, or use a Cloud sign-in — including writing-skills baseline and with-skill runs and pressure scenarios that use artifacts with `--auto-approve`.
---

# Isolated Agent Eval

An agent with auto-approve runs whatever it decides to. When the run can see a Ryugi Cloud sign-in, that includes publishing to your account: a host-side baseline run once published its artboard publicly. Such runs happen in a throwaway container with no sign-in, writable only to its own output directory.

A run whose Cloud sign-in is already hidden, as `tests/skill-bootstrap-eval` does with a private `XDG_CONFIG_HOME` per session, may stay on the host. The recipe below runs the OMP CLI; there is no container recipe for Claude Code, Codex or other harnesses, and none is planned.

## Setup, once per session

```bash
S=.claude/skills/isolated-agent-eval
docker build --build-arg OMP_VERSION="$(omp --version | cut -d/ -f2)" -t ryugi-agent-eval:local "$S/docker"
python3 -I "$S/provider-config.py" deepseek "$SCRATCH/secrets/models.yml"
```

`$SCRATCH` is your session scratchpad, outside the repository. The container gets that one provider and its key, never `~/.omp`.

Then smoke-test before the first real run, and read the output:

```bash
mkdir -p "$SCRATCH/empty"
bash "$S/run.sh" --fixture "$SCRATCH/empty" --out "$SCRATCH/runs/smoke" --models-yml "$SCRATCH/secrets/models.yml" \
  --prompt "Start the ryugi artifacts server for artboard/smoke and reply with the Open link it printed."
```

Pass when `status` ends `done`, `env.txt` names the model, and the last message of `turn1.jsonl` carries an `Open: http://localhost:…` link. Anything else is an infrastructure failure; fix it before running scenarios.

## A run

```bash
bash "$S/run.sh" --fixture "$SCRATCH/runs/<arm>-<case>-<rep>" --models-yml "$SCRATCH/secrets/models.yml" \
  --prompt "<task>" --turns 3 [--next "按推荐，继续"] [--plugin < dir > --out < checkout > ]
```

- Each run gets its own `--out`. Run several in parallel as background jobs, at most Docker's memory divided by `--memory` (3g).
- `--out` holds `status`, `env.txt`, `turnN.jsonl`, `turnN.err`, `after-turnN.txt` (`git status` after each turn), `repo/` (the fixture after the run, with `.ryugi/`), `sessions/` and `container.log`.
- `--resume <run dir>` instead of `--fixture` continues that run's session and repo in a new `--out`; `--prompt` is the next turn's message. To test one turn many times, run the turns before it once with `--turns 1` and replay from that run. The source run is mounted read-only and never changed.
- `--plugin` is the checkout whose skills are under test; default this repository. It is mounted read-only but live: edits to it change what running agents read. Give each arm its own worktree (`git worktree add .worktrees/eval-baseline <rev>`) so baseline and candidate can run at once. A worktree has no gitignored local artifacts build, so its runs use the npm release.
- Symlinks in the checkout pointing outside it (a local `ryugi-cloud` build) are mounted read-only at their own paths automatically.
- The container has no Ryugi Cloud sign-in, so nothing is published.

## Rules

- A session that could act on Ryugi Cloud does not run on the host with your sign-in visible. Not for "just one quick check".
- Never mount a home directory, `~/.omp`, `~/.claude`, `~/.ryugi` or a credentials file other than the provider config.
- `run.sh` runs from a private copy, so editing it mid-run is safe. Anything else a run executes from the host (your own batch script, a scorer it calls) is not: never edit or format it while runs are in flight. The Dockerfile and `entrypoint.sh` are baked into the image at build; rebuild before the next run, not during one.
- Never `export` variables in a persistent shell to isolate something; they leak into every later command.
- When done: delete `$SCRATCH/secrets`, and check `docker ps --filter name=agent-eval` is empty.
- In the eval record, name the image (`env.txt`) and say the runs were containerized.

## Red Flags

| Thought                                                        | Reality                                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| "I'll give each run its own server home and port on the host"  | One host run still published its artboard publicly to Cloud; another deleted `~/.ryugi/server/start.lock`. |
| "I'll fix the runner script now; the runs already started"     | The running scripts read the new file and broke mid-run. Wait, or copy to a new name.                      |
| "Formatting the skill folder doesn't change behaviour"         | `prettier --write` rewrote a running script and five runs hit `unexpected EOF`. A formatter is an edit.    |
| "Mounting `~/.omp` is simpler than extracting the provider"    | It hands every key and session on the machine to an agent with auto-approve.                               |
| "The checkout is read-only in the container, so I can edit it" | Read-only to the container, live to it too. Agents read your edits mid-run.                                |
