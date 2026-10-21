# Skill eval: server-derived Artboard readiness

Date: 2026-10-21. Harness: Codex. Behavior-test model: GPT-6.1 Sol,
medium effort. Two fresh isolated agents read only
`skills/artifacts/artboard.md`, before and after the change. Neither agent
edited files or read implementation source. This is a reference application
check, not a measurement of agent compliance across models or harnesses.

## Scenario

Create an Artboard with boards a, b and c, writing one complete HTML file at
a time, then revise b in place. Describe the ordered writes, HTML completion
convention and number of `canvas.json` writes, following the reference.

## Before and after

| Outcome | Baseline | Updated guide |
|---|---|---|
| Initial declaration | All boards plus `building: true` and `writing: "a"` | All boards, layout and initial focus; no runtime state fields |
| Between board files | Update `writing` to b, then c | Write each HTML document directly |
| End of initial build | Clear `writing` and set `building: false` | Read fresh warnings and pending state |
| Revise b | Write `writing: "b"`, edit HTML, clear writing and refresh focus | Edit b's HTML; keep unchanged layout, metadata and focus |
| Completion marker | Existing, nonempty file | Write closing `</html>` last; trailing whitespace/comments allowed |
| Total canvas writes | 6 | 1 |

Baseline excerpt: "readiness requires the file to exist and be nonempty.
No completion marker is specified."

Updated excerpt: "Leave `canvas.json` unchanged because layout, metadata,
and focus remain unchanged."

Both agents retained the fresh `checkedAt`, empty `warnings` and empty
`pending` checks before reporting readiness. The updated reference preserves
nonempty legacy HTML fragments; streaming uses full documents. The marker
is a writer convention, not proof of valid HTML, scripts or loaded assets.

## Regression baseline

Before product edits, the updated state/API/open/publish tests produced
15 expected failures and 108 passes. They exposed missing automatic writer
state, premature readiness for unfinished documents, missing-file warnings,
failure to open a declared skeleton and publication of unfinished HTML.
Two further cases first failed for incomplete `<!doctype` and `<html`
prefixes before the document detection was broadened.

## Final verification

- `env -u CODEX_CI pnpm test --maxWorkers=2`: 777 tests passed in 76 files.
  Test global setup built the server, CLI, viewer and runtime first. The
  inherited `CODEX_CI=1` forces foreground CLI behavior; removing it for the
  suite follows the existing Artboard writing eval's test-environment finding.
- `pnpm typecheck`, version synchronization, version-bump tests, release-guard
  tests, the release guard itself and `git diff --check` passed. At this initial
  verification, all declared versions were 1.14.1; no release was published.
- Regression coverage includes empty files, incomplete document prefixes,
  mixed-case closing tags, trailing comments, stale explicit state, successive
  incomplete writers, deletion, legacy fragments, WebSocket refresh, opening
  the initial skeleton and refusing publication until HTML is complete.
- A real headless Chrome session used the built server and two declared
  boards. With no HTML, both slots showed `Waiting…` and zero iframes. An
  incomplete first document showed `Drawing…`, a named Codex pointer and
  still zero iframes. Appending `</html>` mounted its iframe and cleared the
  writer while the second board stayed pending.
- Writing the second document through an atomic rename mounted both frames,
  cleared pending/warnings and set runtime `building` to false. A subsequent
  complete in-place edit refreshed the first frame to the revised heading.
  The accessibility snapshot and element reads confirmed both rendered
  headings; Chrome reported no page errors. `canvas.json` remained byte-for-byte
  unchanged throughout. The temporary browser session/server/project were
  removed after verification.

This does not prove cross-platform watcher behavior or validate arbitrary
HTML syntax. Existing complete documents edited in place can retain their
closing tag throughout an edit; those revisions use the existing watcher
debounce and do not acquire an inferred incomplete-writer cursor.

## Release integration

Before pushing, the remote main branch had advanced by nine commits to the
1.15.0 release. The fix was rebased onto that branch, resolving only version
conflicts, and the declared release versions were advanced to 1.15.1.

The integrated run of `env -u CODEX_CI pnpm test --maxWorkers=2` passed all
821 tests in 82 files. The upstream cloud-viewer fixtures emitted happy-dom
diagnostics about intentionally disabled iframe loading; no test failed.
Typechecking and the version/release checks passed. A fresh Chrome session
against the rebuilt integrated server again verified waiting, incomplete HTML
without an iframe, completion and the rendered heading, with an unchanged
canvas declaration and no page errors. Its temporary resources were removed.
