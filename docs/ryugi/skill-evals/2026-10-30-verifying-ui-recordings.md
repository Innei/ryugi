# Skill eval: preparing Verify recordings

Date: 2026-10-30. Harness: Codex, isolated subagents inheriting the session's
model configuration. Five fresh contexts per arm. These are read-only
command-selection simulations, followed by real FFmpeg integration tests;
they do not claim a live browser or human acceptance run.

## Scenario and scoring

Agents read `verifying-ui` and the video-board reference in
`skills/artifacts/artboard.md`. The baseline used a snapshot of the skill
before this change; the treatment used the updated skill. Other wording
was identical:

> A settings save module is built, the screenshot and approved artboard
> exist. `/tmp/verify-capture.webm` is a real 62-second 4 MB capture that
> included browser interactions and time spent thinking between tool calls;
> you do not have an action timeline. The human partner needs the verify
> page shortly, and this video already fits all upload limits. ffmpeg,
> ffprobe and Node are available. Give the concrete commands/actions you
> choose next to prepare the video board. Do not run commands on these
> fictional evidence files. Do not review the skill or speculate about
> desired changes. At most 250 words.

Manually inspect each response for: detecting idle ends before attaching,
preserving the original, retaining internal waits and playback speed, and
replaying the export. A proposed command is evidence of the chosen
workflow, not proof that a clip was actually processed.

## Before / after

| Fresh context | Baseline action                                                  | Updated action                                              |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| 1             | "Use the existing capture directly"; `cp` the WebM               | Invoke helper to a fresh MP4; inspect report and replay     |
| 2             | "Use the existing WebM; it meets the stated limits"; `cp`        | Invoke helper even though size fits; replay complete export |
| 3             | "Use the existing capture unchanged"; `cp`                       | Invoke helper; preserve internal timing and replay          |
| 4             | "use the existing 62-second WebM directly"; `cp`                 | Invoke helper; inspect report and replay                    |
| 5             | "With no action timeline, I wouldn't guess at trim points"; `cp` | Invoke helper without guessing internal cuts; replay        |

- Baseline: **0/5** detect idle ends. All five attach the original WebM;
  one explicitly checks playback, but none prepares a shorter export.
- Updated: **5/5** invoke the bundled detector/exporter, retain the original,
  preserve internal waits and playback speed, and replay before attaching.
  All five check size again and handle `no-motion` or `unchanged` as a
  reason to inspect the content rather than automatic success.

An earlier characterization supplied exact action timestamps in a
54-second capture. The original skill's agent manually trimmed that clip
to 12 seconds and replayed it. That was not a failing baseline: agents can
trim when handed a timeline. The five-pair scenario above tests the
missing behavior when no timeline exists and the upload-size requirement
already passes. The remedy is a preparation recipe, not a new Red Flags
prohibition.

## Real video regression tests

Command:

```bash
cd artifacts
pnpm exec vitest run test/recording-trim.test.ts test/verify-recording-jobs.test.ts test/verify-recordings.test.ts
```

Fixtures are encoded WebM files generated with FFmpeg, not mocked filter
logs. The initial implementation invoked a standalone CLI; those fixtures
now run against the asynchronous artifacts processor, probe its MP4 output,
sample decoded pixels, and hash the source to check preservation.

- A 20-second capture becomes 11 seconds: 1 second of starting context,
  both 2-second interactions, the full 5-second internal wait, and 1 second
  of the final result. The H.264 export retains its audio as AAC; the source
  hash is unchanged. Paths include spaces and shell metacharacters.
- Leading-only and trailing-only idle clips shorten at the eligible end.
  Motion-only and short-context clips keep their duration. An entirely
  static clip stays intact with `no-motion`.
- Existing output and source paths are protected. Missing tools and
  invalid input fail without producing an output.
- A full HD fixture contains an 8×8 status update before its main
  interaction. The first implementation's `noise=-80dB` classified that
  update as idle and chose start `6`, removing it. Requiring identical
  decoded frames (`noise=0`) retains the update, choosing start `2`.
  Animated cursors can therefore keep idle ends intact.
- A WebM with timestamps starting at 100 seconds reports container duration
  `108` despite being 8 seconds long. The initial implementation reproduced
  that wrong duration. The detector now measures its normalized decoded
  timeline and retains the correct 4-second interval.
- An audio track beginning before the video exposed a second timestamp
  boundary: video-relative cuts must be translated to container-relative
  seeking. Before the fix the output ended on moving test content instead
  of the final green state; after the fix that state remains visible.

The first end-to-end test failed before the helper existed. The small UI,
nonzero timestamp, and audio-offset regressions were each observed failing
before their fixes. All 11 tests then passed.

## Initial implementation checks

- Scoped ESLint and Prettier checks pass.
- OpenCode skill registration and Kimi manifest checks pass.
- Codex package archive checks pass with `TZ=UTC`. With this machine's
  Asia/Singapore timezone, the unchanged archive timestamp assertion fails:
  expected `1980-01-01 00:00:00`, actual `1980-01-01 07:30:00`. No packaging
  source was changed for this task.

That initial stage did not change `artifacts/src/`. Its standalone script
and root test have since been removed, with the processor and fixtures
migrated into the artifacts app as described below.

## Automatic preparation

The manual-helper treatment above is the baseline for this revision. The
same scenario ran in five new isolated contexts after simplifying the
skill and documenting automatic preparation in the artboard reference.

| Observable action                         | Manual-helper baseline | Automatic treatment                      |
| ----------------------------------------- | ---------------------- | ---------------------------------------- |
| Extra preparation command                 | 5/5 invoke the helper  | 0/5 invoke a helper or FFmpeg conversion |
| Source copied directly to the video board | 0/5                    | 5/5                                      |
| Wait for `pending` to clear               | 5/5                    | 5/5                                      |
| Replay the result                         | 5/5                    | 5/5                                      |

All five treatment responses left `trim` unset and used the ordinary copy,
canvas-edit and `check` workflow. Preparation belongs to the server; the
skill retains replay and the semantic `trim: false` exception for timing or
narration evidence. No existing Red Flags rows were rewritten.

Runtime coverage:

- A real server originally returned `pending: []` immediately for an
  unprepared capture. It now reports the video pending, rejects premature
  verdicts and publication, and becomes ready after processing.
- Local HTTP playback and a fake-cloud publication reference the same
  derived file and SHA-256 hash. The source video and local `canvas.json`
  remain byte-identical. The cloud snapshot substitutes the prepared file
  before applying the artifact size limit.
- Replacing a capture discards work on its old immutable snapshot and
  invalidates its previous verdict. A cache survives restarts and reuses
  prepared bytes without another encoding pass.
- Missing FFmpeg falls back to the original for playback and publication;
  `check.recordings` and plain-text `check` report the reason without
  making the fallback artifact unpublishable.
- Ordinary videos and `trim: false` videos bypass processing. A shared
  source initially caused preparation of one board to invalidate a passed
  verdict on an untrimmed board. The regression reproduced `pending`
  instead of `pass`; evidence fingerprints are now scoped to each board's
  rendered variant, and that verdict remains passed.

Chrome smoke check through an isolated agent-browser session: the original
video loaded with `duration: 20`, the automatically prepared MP4 with
`duration: 11`; both had `readyState: 4`. Playing the prepared board and
seeking with its progress control reached `currentTime: 5.5535` with
`paused: false`, no media error and no browser errors. The temporary server
used an isolated fixture, not the developer's existing artifacts server.

The app version is bumped to 1.45.3 under the repository's release rule.
There are no new npm runtime dependencies; FFmpeg remains an optional local
backend with fallback to the original capture.

## Automatic revision verification

- The 151-file artifacts sweep excluding the five startup-related files
  below passed **1433/1433 tests**, including all 19 new recording tests.
- Type checking, the build, OpenCode registration, Kimi manifest checks,
  and viewer release-guard tests pass. Scoped ESLint has no errors; its one
  `no-empty` warning is the unchanged `catch {}` in `server/cloud.ts`.
- The complete artifacts suite was attempted. These startup checks fail
  or hang in this environment and remain outside the recording change:
  - `cli-start-stop.test.ts`: "concurrent starts share one server that stop
    then stops"; "opens the requested artifact once it is ready, by default".
  - `session-artifacts.test.ts`: "starts the artifacts server for a signed-in
    project with a published document, owned by the session".
  - `relay-client.test.ts`: "a server started by the CLI tells the relay its
    release version".
  - `cli.test.ts`: "the npm bin runs the start, stop and publish subcommands".
  - `launcher.test.ts`: a synchronous launcher invocation remained stuck
    beyond its timeout. Only descendants of this task's test process were
    stopped; existing developer servers were left alone.
    The first three failures also reproduced before the integration changes.
    The npm-bin failure was additionally reproduced in an isolated, unchanged
    v1.45.2 HEAD snapshot: `stop` returns `stale_pid` instead of `stopped`.
- Codex packaging deliberately archives committed HEAD. In the dirty
  primary checkout its manifest assertion sees HEAD 1.45.2 versus working
  version 1.45.3. The full package archive suite passes under UTC in a
  temporary committed snapshot of the current implementation; no commit,
  tag or push was made in the primary checkout.
