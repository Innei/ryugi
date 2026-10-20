# Document comments CLI — TL;DR

Full spec (for the agent): `2026-10-21-document-comments-cli-design.md`

## What gets built

1. **CLI**: `ryugi-artifacts comment list | add | reply | resolve`. Agents stop touching `comments.json`.
2. **Identity**: each agent message is named after the agent that ran the CLI, not whoever started the server.
3. **Unread**: `comment list` shows only what you changed since that agent last looked.
4. **Hook**: in Claude Code, your document selection and "N new comments" reach the agent with each message.
5. **Shared docs**: TOC on the left, read-only comment rail on the right, same components as local.

## What you'll see

1. Codex replies to a thread while a Claude Code–started server runs → the card says Codex.
2. You comment, then send the agent a message → it gets "document/x: 1 new comment change(s). Run `… comment list …`".
3. Agent runs `comment list` → sees only your new comment; running it again → "no new comments".
4. Select a paragraph in a doc, ask "改一下这段" → the agent gets the quoted text and block id.
5. Open a published doc → TOC left, cards right with connectors, no reply/resolve buttons.

## Decided

| Topic | Decision |
|---|---|
| Who writes `comments.json` | server only; CLI calls the running server with the key |
| Name source | CLI process's own env (`detectAgent`); old file writes fall back to today's name |
| Unread scope | your changes only; agent's own writes never count as news |
| Cursor | per agent name per document; only `list` moves it, the hook never does |
| Shared rail | read-only; no badges; human avatars dropped (cloud CSP, email hash) |
| Release | one release, 1.11.0 |

## Check these (agent's calls, not yours yet)

1. Cursor is per agent name, not per session: two Claude Code sessions on one doc share it.
2. Right after the upgrade (no cursor yet), only open threads waiting on the agent count as unread, so old docs don't nag.
3. No `comment reopen`; reopening is yours in the viewer.
4. `add` rejects a block id that isn't in the document.
5. Artboard context wins over document context when the hook's 8000-char budget runs out.
6. Threads gain `statusBy` so the agent's own resolve isn't shown to it as news.
7. Launcher minimum goes to 1.11.0 (rollback floor too); an old running server → `comment` says "run start".
8. `ryugi-cloud` viewer bump is a follow-up, not in this release.

## Time

About 4–6 hours of agent work: CLI + server ~1.5h, hook + doc selection ~1h, shared view ~1h, skill baseline/after runs ~1h, tests and release the rest.
