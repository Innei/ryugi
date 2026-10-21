# Auto-publish — TL;DR

Full spec (for the agent): `2026-10-21-auto-publish-design.md`

## What gets built

1. **Turn-end publish**: when the agent's turn ends, every artifact changed in that turn is published; new ones go up private.
2. **Settings**: global `autoPublish` in `~/.config/ryugi/config.json`, personal project override in `.ryugi/config.json`.
3. **Ask once**: people already signed in are asked once (in chat and in the viewer); new sign-ins get it on.
4. **Cloud list page**: ryugi.innei.dev `/` lists your cloud artifacts when signed in, grouped by project.

## What you'll see

1. Agent edits a mockup and stops talking → a private copy appears on ryugi.innei.dev a few seconds later.
2. Open ryugi.innei.dev on the phone → your artifacts listed, tap one → latest snapshot (read-only).
3. Upgrade while signed in → the agent asks you once whether to turn it on; nothing uploads until you answer.
4. Unpublish an artifact → it stays offline even after more edits, until you publish it by hand.
5. Hit 100 artifacts → the agent tells you once; existing copies keep updating.

## Decided

| Topic | Decision |
|---|---|
| Trigger | agent turn end, changed artifacts only |
| Visibility | new copies private; existing visibility never changed |
| Default | on after sign-in; existing sign-ins asked once |
| Backfill | none |
| Project override | `.ryugi/config.json`, gitignored, personal |
| Unpublish | opts that artifact out until a manual publish |
| Cloud cap | 100 stays; notice once |

## Check these (agent's calls, not yours yet)

1. One-time question comes from the SessionStart hook + a viewer banner; "Not now" writes `false`.
2. CLI: `ryugi-artifacts config --auto-publish on|off [--project]`.
3. Failures stay silent and retry next turn; expired sign-in pauses it and tells the agent once.
4. A public choice stored before the first publish is honored.
5. Deleting an artifact locally never deletes its cloud copy.
6. Cloud list has no live thumbnails, just a type placeholder.
7. Cloud gains a `project` column (directory basename).
8. Claude Code only for now; Codex/Cursor if they have a turn-end hook.

## Time

About 1–2 days of agent work: server dirty tracking + flush ~4h, hooks + CLI + ask-once ~3h, cloud list page + migration ~4h, skill baseline/after runs ~2h, tests and release the rest.
