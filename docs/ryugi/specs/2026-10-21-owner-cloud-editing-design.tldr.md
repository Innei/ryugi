# Owner editing on the cloud — TL;DR

Full spec (for the agent): `2026-10-21-owner-cloud-editing-design.md`

## What gets built

1. **Relay**: a Durable Object per account (free plan, hibernation) connects your local server and your browser; only you, only your own documents.
2. **Live cloud documents**: when your computer is online, comment, reply, resolve and edit text on ryugi.innei.dev; it lands in local files in real time.
3. **Phone layout**: comments in a bottom sheet (3 heights), select text → 评论 / 复制 / 改字, no cards.
4. **Server stays up**: the local server starts with your agent session when the project has published documents, and phone use keeps it awake.

## What you'll see

1. Open your document on the phone while a session runs → top bar 电脑在线, comments in the sheet.
2. Select a sentence → 评论 → type → the comment appears locally at once; say "看下评论" in chat and the agent reads it.
3. Select text → 改字 → edit → 完成; the change is in `doc.xml` at once.
4. Session ends → page turns 电脑离线, sheet title 电脑离线，暂时不能评论, still readable.
5. A visitor of your public link sees today's read-only page.

## Decided

| Topic | Decision |
|---|---|
| Main use | comments; occasional text edits |
| Offline | fully read-only, nothing queued |
| Platform | Cloudflare Durable Object, free plan; self-hosting later |
| Online when | an agent session is open in the project |
| Phone layout | FloatingSheet (q1r3), edit menu (q2r4-a), offline hint in top bar + sheet title (q3r4-b) |
| 改字 | explicit mode with 完成 |

## Check these (agent's calls, not yours yet)

1. One DO per account; local server connects with its CLI token, browser with its session cookie; the Worker checks ownership.
2. Dropping offline keeps the last live view read-only; the snapshot only on a fresh load.
3. Comments work across viewer/server versions; text editing needs the same major.minor, else 改字 is disabled with a reason.
4. Your phone selection travels too, so "改一下这段" has context.
5. Images added since the last publish are not relayed; they show after the next publish.
6. Phone layout kicks in at ≤ 640px wide, also in the local viewer.
7. An unsent change when the connection drops stays in the composer with a "not saved" note.

## Time

About 3–4 days of agent work: relay DO + Worker routes ~1d, local relay client + server lifetime ~1d, viewer transport + live cloud page ~0.5d, phone layout (sheet, edit menu, 改字) ~1d, tests and release the rest.
