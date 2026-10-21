# One page, two pipes — TL;DR

Full spec (for the agent): `2026-10-21-cloud-direct-local-design.md`

## What gets built

1. **Cloud link first**: `start` prints `cloudLink`; a new artifact gets an empty cloud record right away, and the agent gives that link.
2. **Direct on this machine**: the cloud page connects to `127.0.0.1:<port>` itself, skipping the Durable Object.
3. **CF elsewhere**: on other machines and phones the cloud page goes through the relay, live for all types.
4. **Same page everywhere**: artboard, HTML and document use the same live layouts on localhost and on the cloud.

## What you'll see

1. The agent starts an artboard → the browser opens `ryugi.innei.dev/a/…`, boards appear as they are drawn.
2. First time in Chrome on this machine → one "local network" prompt; allow it, then edits feel like localhost.
3. On a phone while the agent works on the computer → the same page redraws live, through CF.
4. Computer offline → the last published copy, read-only; nothing published yet → "not published yet".
5. A visitor of a public link → today's snapshot.

## Decided

| Topic | Decision |
|---|---|
| Entry point | the cloud page; localhost stays, same interactions, no redirect |
| Same machine | direct to localhost |
| Other machines | CF relay, live for the owner, all types |
| Safari | not handled; uses CF |
| Who connects directly | the signed-in owner only |
| Port and key | reported by the local server to the relay, read by the owner's page |
| New artifact | empty cloud record at `start`, rendered live from the host |

## My calls (check these)

- Updated 2026-10-22: automatically try the owner's advertised candidates, including on a first visit. Known hosts get priority; permission checks and failed attempts leave the relay usable. Previously successful direct connections retry with backoff after a disconnect.
- The server's auto-open opens the cloud link.
- Selection, Inspector tweaks and runtime errors from the cloud page go back to the agent on both pipes.
- Cloud links only where auto-publish runs (Claude Code).
- Presence lists every live host for an id, not only the newest.
- The direct pipe reuses the relay protocol; HTML/artboard files over CF come through a proxied content route.
