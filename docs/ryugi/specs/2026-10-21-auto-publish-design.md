# Auto-publish: private cloud copies that follow the agent's turns

Agreed with the human partner on 2026-10-21 in chat. No artifact was used.

## Why

The human partner often drives this computer from another machine or a
phone (remote control of the agent session). Artifacts live on
`localhost`, so from the phone nothing the agent made can be opened. Today
the only way out is a manual `ryugi-artifacts publish` per artifact, and a
published copy is a snapshot that goes stale on the next edit.

They want every artifact they own to have a private cloud copy that keeps
up on its own, and a page on ryugi.innei.dev that lists those copies, so
the phone can reach anything the agent made.

This is project 1 of 3. The others, brainstormed separately later:

2. **Owner editing on the cloud.** The owner gets the full local experience
   online (edit document text, comment, select artboard nodes), relayed
   live to the local server, which stays the source of truth (likely a
   Durable Object on ryugi-cloud). Once that exists, the snapshots from this
   project become the fallback for when the computer is offline.
3. **Phone layout.** Toolbar, comment rail and artboard on narrow screens.

Nothing in this project may make 2 harder: keep the cloud id per artifact
stable, and keep the local server as the single place that talks to the
cloud.

## Goals

- When the human partner is signed in and auto-publish is on, every artifact
  that changed during an agent turn is published when the turn ends.
- An artifact auto-publish creates is always private.
- Auto-publish is on by default for new sign-ins. Someone already signed in
  when they upgrade is asked once and nothing auto-publishes until they say
  yes.
- One global setting, overridable per project.
- A signed-in list page at ryugi.innei.dev `/` showing all of the owner's
  cloud artifacts, reusing the local viewer's artifact list.

## Non-goals

- Editing, commenting or selecting on the cloud copy (project 2). Cloud
  copies stay read-only, as published documents are today.
- Phone-specific layout (project 3).
- Publishing on file changes, timers or debounces.
- Backfilling artifacts that were not changed after auto-publish was turned
  on.
- Harnesses with no turn-end hook. Claude Code first; see "Left to the
  builder".

## Anti-goals

- **Never widen visibility.** Auto-publish never picks public on its own
  (only an owner's stored choice can make a copy public, see "Edge cases")
  and never changes an existing artifact's visibility. A manually published
  public artifact that changes in a turn is re-published and stays public;
  that is the existing re-publish behavior, not a widening.
- **Never interrupt the agent's turn.** No auto-publish failure blocks,
  delays or fails the turn, and the turn-end hook stays fast.
- **No surprise uploads for existing users.** Upgrading alone publishes
  nothing.

## Decided with the human partner

| Topic | Decision |
|---|---|
| Trigger | the agent's turn ends |
| What is published | artifacts changed during that turn; unchanged ones are not touched |
| What does not trigger | local file changes by themselves |
| First publish visibility | private |
| Finding artifacts on the phone | signed-in list page at ryugi.innei.dev, reusing the local list |
| Scope | global setting, all projects |
| Project override | `.ryugi/config.json` |
| Default | on after sign-in |
| Existing signed-in users | asked once, off until they confirm |
| Old, unchanged artifacts | not published |
| Project override file | existing gitignored `.ryugi/config.json`, personal |
| Account cap / versions | unchanged on the cloud; tell the agent once when the cap is hit |
| After unpublish | that artifact stops auto-publishing until published by hand |

## How it behaves

### Settings

- Global: `autoPublish` in `~/.config/ryugi/config.json` (same directory and
  Windows rule as `credentials.json`, see `src/server/credentials.ts`).
  Values: `true`, `false`, or absent.
- Project: a top-level `autoPublish` in `<project>/.ryugi/config.json`, the
  existing file that already holds per-artifact cloud records
  (`artifacts/src/server/main.ts` `configFile`, `src/server/config.ts`).
  When present it wins over the global value. The file stays gitignored
  (`.ryugi/.gitignore`), so the override is personal to this machine and
  never shared with teammates. `normalize` must keep the new key instead of
  dropping it.
- Per artifact: `autoPublish: false` on an entry in the same file opts that
  artifact out (see "Unpublish").
- Effective value: project value if set, else global value if set, else off.
- Absent global value after sign-in means "not decided yet":
  - A sign-in completed by this release (CLI callback in
    `src/server/cloud.ts` `handleCallback`) writes `autoPublish: true` if
    the key is absent, and the callback page says auto-publish is on and how
    to turn it off.
  - Credentials that already exist with no `autoPublish` key are the
    existing users. They get asked (next section).

### Asking existing users once

The human partner may be on a phone, so a localhost banner alone is not
enough.

- *(My call.)* The SessionStart hook, when credentials exist for the
  configured origin and the global config has no `autoPublish` key, adds a
  short instruction for the agent: ask your human partner once whether to
  turn on auto-publish, explaining private copies and the list page, then
  run the CLI with their answer.
- *(My call.)* A CLI command sets it, for example
  `ryugi-artifacts config --auto-publish on|off [--project]`. Without
  `--project` it writes the global file; with it, the project file.
- *(My call.)* The local viewer shows the same question as a banner (next to
  `CloudBanner`) with Turn on / Not now. "Not now" writes `false`.
- Once the key exists, neither the hook nor the banner asks again.

### What "changed during the turn" means

- The server already watches the artifacts tree (`watchTree` in
  `src/server/app.ts`). An artifact is dirty when its files change while
  auto-publish is effectively on, including changes the server writes
  itself (document edits from the browser, `comments.json`).
- Changes made while auto-publish is off do not make an artifact dirty, so
  turning it on does not backfill. An old artifact edited after it is on is
  dirty like any other.
- *(My call.)* Dirty marks persist in `.state/` so a server restart between
  the edit and the turn end does not lose them.

### Turn end

- A Claude Code `Stop` hook calls the running local server (key from
  `.state`, same pattern as `hooks/user-prompt-submit`) and returns
  immediately. If no server is running for the project, it does nothing.
- The server publishes each dirty artifact through the existing publish path
  (`publish` in `src/server/cloud.ts`): first publish creates it private,
  later publishes keep the cloud id and current visibility.
- One flush at a time per project. A turn that ends while a flush runs
  queues one more flush; artifacts that change during a flush stay dirty for
  the next one. Uploads are never run in parallel for the same artifact.
- An artifact is marked clean only after its publish succeeds.

### Failures

- Network or cloud error: the artifact stays dirty; the next turn end
  retries. Nothing is shown in the turn.
- Validation warnings (publish returns `reasons`): skip that artifact,
  leave it dirty, do not report every turn. *(My call: the viewer's existing
  warnings badge already shows them.)*
- Signed out or token rejected (401): stop flushing until signed in again.
  *(My call.)* The next UserPromptSubmit hook tells the agent once that
  auto-publish paused because sign-in expired, with the login command;
  repeat only after a later successful sign-in expires again.

### Unpublish

- Unpublishing an artifact (viewer menu, `publish --unpublish`, or
  `publish --delete` of its cloud copy) also sets `autoPublish: false` on
  that artifact's entry. Later edits do not republish it.
- A manual `publish` of that artifact clears the flag, and auto-publish
  follows it again.
- The viewer's publish menu and the skill say this in one line each.

### Account cap

- The cloud keeps its limit of 100 artifacts per account
  (`MAX_ARTIFACTS_PER_ACCOUNT` in `ryugi-cloud/src/artifacts/storage.ts`) and
  keeps every version. No cloud change for either.
- When a create is refused for the cap (403), auto-publish stops creating
  new cloud copies; artifacts that already have one keep being republished.
  The next UserPromptSubmit hook tells the agent once that the limit is
  reached and the human partner can delete old copies on the list page or
  with `publish --list` / `--delete`. Creates resume after a later flush
  succeeds in creating one (a successful create resets the notice).

### Edge cases (my calls)

- **Visibility chosen before the first publish.** If the owner already set
  public in the publish menu for a never-published artifact, the first
  auto-publish honors that stored choice; it was the owner's decision, not
  auto-publish widening anything. With nothing stored, it creates private.
- **Local artifact deleted.** The dirty mark is dropped and the cloud copy is
  left alone; it stays on the list page until the owner deletes it there or
  with `publish --delete`. Auto-publish never deletes cloud copies.

### Cloud list page

- ryugi.innei.dev `/` for a signed-in browser session (`BrowserSessionGuard`
  and the session cookie already exist) serves the viewer, whose `list`
  route renders the owner's cloud artifacts with the same component as the
  local list (`src/viewer/layouts/ArtifactList.tsx`,
  `ArtifactThumbnail.tsx`). Signed-out visitors get the page they get today,
  plus a sign-in link. *(My call.)*
- Each row links to `/a/<id>` and shows title, type, visibility and last
  updated time. *(My call.)* No live thumbnails: `ArtifactThumbnail` iframes
  the local `/preview/` route, which the cloud does not have. Reuse the list
  layout with a type placeholder instead of the thumbnail.
- *(My call.)* Sorted by last update, grouped by project. The cloud does not
  know projects today: `ryugi-cloud` gains a nullable `project` column on
  `artifacts` (D1 migration), set on create and updated on each version
  from the project directory's basename.
- Manually published public artifacts appear too, marked public.

## Constraints

- Plugin stays zero-dependency; the server may bundle dependencies as today.
- Any change under `artifacts/src/` ships as a release
  (`scripts/bump-version.sh`); the launcher minimum stays as is unless the
  hook needs a new server route, in which case an old running server must
  fail quietly (hook does nothing) rather than error.
- `ryugi-cloud` changes deploy separately and must work with older clients
  (missing `project` is fine).
- Skill text changes (`skills/artifacts/SKILL.md`: what auto-publish does,
  that the agent should not manually publish what auto-publish covers, how
  to answer the one-time question) follow `writing-skills` with a baseline
  and an after run.

## Left to the builder

- Whether Codex and Cursor have a turn-end hook. If one does, wire it; if
  not, auto-publish does not run there and the skill says so.
- Exact CLI flag names and JSON event shapes, following `src/cli/main.ts`.
- How the cloud list route fetches data (new endpoint for the browser
  session or reuse of `GET /api/artifacts` with cookie auth).
- Dirty-state file format under `.state/`.
