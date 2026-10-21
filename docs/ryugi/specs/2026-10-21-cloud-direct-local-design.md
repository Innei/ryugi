# One page, two pipes: the cloud page talks to localhost when it can

Agreed with the human partner on 2026-10-21, in chat and in the Claude Doc
"Ryugi 线上页面直连本机". Builds on `2026-10-21-auto-publish-design.md` and
`2026-10-21-owner-cloud-editing-design.md`.

## Why

Auto-publish is on globally (`~/.config/ryugi/config.json` →
`{"autoPublish": true}`), so every artifact already has a private cloud copy.
But the agent still hands out the `localhost` link, and the cloud page is a
second, weaker surface: documents are live there only through the Durable
Object relay, artboards and HTML are static snapshots.

The human partner wants one design that behaves the same wherever it is
opened ("同构"): the local page and the cloud page are the same interactions.
Going through the CF Durable Object when the server is on the same machine is
too slow, so on that machine the cloud page should talk to `localhost`
directly. On any other machine it goes through CF, and still has to show what
the agent is doing live: "when I'm having the agent do this in another
environment, I need to see it change."

## Goals

- The agent gives the cloud link (`ryugi.innei.dev/a/<id>`) for any artifact
  that has one. A new artifact gets its cloud record at `start`, so the link
  exists at the moment the agent hands it out.
- On the cloud page, the signed-in owner gets the same live behaviour as the
  local page for **all three types**: artboard boards redraw, HTML reloads,
  documents edit and comment in real time.
- If the local server for that artifact runs on the same machine as the
  browser, the cloud page connects to `127.0.0.1:<port>` directly; no hop
  through Cloudflare.
- Otherwise the owner's cloud page goes through the CF relay, with the same
  live behaviour (as long as the publishing computer is online).
- The `localhost` page keeps working, with the same interactions as the cloud
  page.

## Non-goals

- Safari reaching localhost. Safari 18 blocks http/ws to localhost from https
  pages ([WebKit 279249](https://bugs.webkit.org/show_bug.cgi?id=279249)); it
  simply takes the CF path. No workaround.
- Live updates for anyone but the owner. Public-link visitors keep today's
  published snapshot.
- Redirecting `localhost` links to the cloud. Both entry points stay.
- Editing while the publishing computer is offline. Offline stays read-only,
  as in the owner-editing spec.

## Anti-goals

- The local server's key reaching anyone other than the signed-in owner, or
  any origin other than the configured cloud origin.
- The cloud page getting slower than today when no local server is running:
  the direct attempt must fail fast and fall back without a visible stall.
- Breaking users who are not signed in or have auto-publish off: they keep
  today's `localhost` link and behaviour.

## Decided with the human partner

| Topic | Decision |
|---|---|
| Entry point for published artifacts | the cloud page |
| Same machine as the local server | cloud page connects to localhost directly, not via the DO |
| Other machines | through the CF relay |
| Types live on the cloud page | all: document, artboard, HTML, same as local |
| Live over CF | yes, for the owner, all types |
| `localhost` link | kept; same interactions; no redirect |
| Safari | not handled; falls back to CF |
| Link the agent gives | the cloud link when one exists |
| New artifact | `start` creates an empty cloud record for the link; the owner's page renders it live from the host until a version is published |
| Who can connect directly | only the signed-in owner |
| How the page finds the port and key | the local server reports them to the relay; the owner's page reads them and tries `127.0.0.1:<port>`, falling back to CF |

## Current state (2026-10-21)

Paths in `ryugi` are under `artifacts/src/`; `ryugi-cloud` is the separate
Worker repo.

- **Relay** (`ryugi-cloud/src/platform/cloudflare/relay-hub.ts`,
  `src/relay/relay-router.ts`): one DO per user. A host sends
  `hello{version, ids}`, `ids`, `reply`, `event`; a viewer sends only
  `request`. The hub routes requests to the newest live host serving the id,
  broadcasts host `event`s to the id's viewers, and sends viewers
  `presence{online, version}`. The zod schema strips unknown keys; only
  `version` and `ids` are stored. The hub does not care about artifact type.
- **What the host serves** (`server/app.ts:656-694`): documents only, those
  with `config.artifacts[key].cloud`. Ops: `meta`, `state`, `update`,
  `comment`, `selection`. File-change `change` messages are already
  `relay.emit`ted (`app.ts:743`), but only document ids are announced.
- **Viewer bundle**: the cloud serves the same `ryugi-artifacts` viewer build
  (`ryugi-cloud/scripts/sync-viewer.mjs`), pinned at 1.13.0. `Shell.tsx:36`
  detects the cloud by `data-ryugi-host="cloud"`.
- **Cloud layouts** (`viewer/layouts/CloudLayout.tsx`): fetch `/api/a/:id`
  once; HTML is a static iframe, artboard renders with no socket, document
  uses `CloudLiveDocument` (relay) for the owner.
- **Local layouts**: `useArtifactSocket` (`/ws`, cookie-authorized) delivers
  `change`; `useCanvasData` / `useHtmlData` refetch
  `/api/artifacts/<type>/:id` and iframes load from
  `contentBase = /c/<contentToken>/<type>/<id>/` with `?v=<version>`.
  Documents go through `DocumentTransport` (`createLocalTransport` /
  `createRelayTransport`).
- **Local server reachability from `https://ryugi.innei.dev`**: none today.
  API responses have no CORS headers, OPTIONS hits the auth check (403), the
  cookie is `SameSite=Strict`, `/ws` rejects foreign origins. Only `/c/`
  content has `Access-Control-Allow-Origin: *`. Binds `127.0.0.1` by default.
- **Auto-publish**: publishes dirty artifacts only on `flush()`, which the
  Claude Code turn-end hook calls (`hooks/flush-artifacts.cjs`). `cloud.url`
  is written to `<project>/.ryugi/config.json` after that.
- **`start` output** (`cli/start.ts`): `{type, url, port, root, link?,
  reused?}`; `link` is the localhost URL. The skill tells the agent to give
  `link`.

## Design

### One protocol, two pipes

The cloud page speaks one request/event protocol, the one the relay already
carries, and opens it over whichever pipe works:

1. **Direct**: a WebSocket to `ws://127.0.0.1:<port>/relay?key=<key>` on the
   local server. The local server answers it with the same handler as relay
   requests (`handleRelay`) and pushes the same events.
2. **Relay**: today's `wss://ryugi.innei.dev/api/relay/a/<id>`.

Everything above the pipe (the layouts, the live hooks) is the same code for
both, and the same code the `localhost` page runs. That is what makes the
pages "the same interactions".

*My call*: reuse the relay protocol for the direct pipe rather than teaching
the cloud page the local HTTP API, so there is one protocol to keep in sync
and the direct pipe needs no CORS on `/api/*`.

### Choosing the pipe

When the owner opens `/a/<id>/view`:

1. Connect to the relay (as today) and wait for `presence`.
2. If `presence` carries `local` entries (below) **and this browser is known
   to sit on that machine**, try the direct socket to `127.0.0.1:<port>` with
   a short timeout. *My call*, to keep Chrome's local-network prompt off
   phones and other machines: a browser is "known" when the page was opened
   from the local machine (the server's auto-open and the localhost page's
   "open on cloud" carry a one-time hint in the URL fragment) or when a direct
   connection to that host succeeded before (remembered per host id in
   `localStorage`). Other devices never try, so never see the prompt.
3. Direct opens → use it, close the relay viewer socket or keep it idle.
   Direct fails (other machine, Safari, Chrome permission denied, timeout) →
   stay on the relay.
4. On a dropped direct socket, fall back to the relay, then retry direct on
   the next `presence`.

Non-owners never get `local` and never try.

### Reporting port and key

- `hello` gains an optional `local: {hostId, port, key}`. `hostId` is a
  stable id for the server (e.g. persisted next to `.last-token`). The host
  sends it when it connects; a server restart reconnects with new values.
- `ryugi-cloud` stores it in the host's `PeerInfo` and adds to the
  `presence` sent to that user's viewers **every** live host serving the id
  (a list), not only the newest one `hostFor` picks. *My call*: two machines
  can serve the same cloud id, and the page should find its own machine's
  server. Viewers are already owner-only
  (`relay.controller.ts:30-33`: origin check, session, `findOwned`).
- Older hosts send no `local`; older clouds strip it. Both still work,
  CF-only.

*My call*: send the existing server key. A narrower token is possible but the
key never leaves the owner's authenticated socket; the builder may introduce
a scoped token if it stays simple.

### Local server changes for the direct pipe

- New `GET /relay` WebSocket upgrade: authorize by `?key=`; accept `Origin`
  equal to the configured cloud origin (from credentials) in addition to the
  server's own origin. Requests address artifacts by cloud id, mapped to the
  local key through `config.artifacts[*].cloud.id`, exactly like the relay.
- Content for artboard and HTML iframes: the direct pipe's `meta` reply
  carries an absolute `contentBase`
  (`http://127.0.0.1:<port>/c/<contentToken>/<type>/<id>/`). `/c/` already
  sends `Access-Control-Allow-Origin: *` and is gated by the token alone.
- Chrome's Local Network Access permission prompt applies to subframe
  navigation and fetch to loopback
  ([Chrome LNA](https://developer.chrome.com/blog/local-network-access)).
  The owner allows it once per origin; if denied, the direct attempt fails
  and the relay takes over. The builder should check what headers or fetch
  options current Chrome needs (`targetAddressSpace`, preflight headers) and
  handle them.

### All types live over either pipe

- **Announce every published artifact**, not only documents:
  `servedDocuments` becomes "served artifacts", any key with a `cloud` entry.
- **Events**: the `change` message already emitted on file changes reaches
  relay viewers once the id is served. Documents keep their `doc-*` events.
- **Ops**: `meta` must work for artboard and HTML (it returns the same
  payload the local `/api/artifacts/<type>/:id` returns).
- **Content over the relay**: on another machine the iframes cannot reach
  localhost, so artboard pages and HTML files must come through CF. *My
  call*: a new content route on the cloud content origin that is proxied
  through the user's DO to the host as a request/reply `file` op, e.g.
  `ryugi-content.innei.dev/<id>/live/<signed owner token>/<path>`, keeping
  relative paths inside the HTML working and staying inside the existing
  sandbox CSP per type. Replies are capped at 12 MB by the hub; larger files
  fall back to the last published copy. The builder may choose a different
  mechanism if it keeps relative paths and the CSP.
- **Viewer**: the cloud layouts for the owner render the same live layouts as
  local (`ArtboardLayout`, `HtmlLayout`, document) fed by a source built on
  the chosen pipe. `useCanvasData` / `useHtmlData` take a source (local
  `/ws` + `/api`, or the pipe) instead of hard-coding the local socket, the
  way `DocumentTransport` already does for documents.
- **What the page sends back**: "same interactions" includes the signals the
  local page sends the agent: artboard selection and Inspector tweaks
  (`selection.json`), HTML `loaded` (the `ran` flag), and `runtime-error`
  reports (warnings, `app.ts:401-437`). *My call*: carry all of them on both
  pipes. Only the owner can connect, and the owner steering the agent from a
  phone is the point. The builder may tag remote runtime errors with their
  origin so the agent can tell them apart.
- **Offline host**: presence offline → the page shows the published copy as
  today, read-only.

### The link the agent gives

- `start` prints `cloudLink` next to `link` when the artifact has a cloud
  record. If auto-publish is effective and the artifact has none yet,
  `start` **creates the cloud record without publishing a version**
  (decided: option B) and records `cloud.url` locally, so `cloudLink` exists
  before any file is written. `start` does not wait for the artifact to be
  publishable.
- A cloud artifact with no published version is valid in `ryugi-cloud`:
  `/api/a/:id` returns it to the owner (today it 404s,
  `artifacts.service.ts:97`), and the owner's page renders it live from the
  host over either pipe. Host offline and no version yet → a "not published
  yet" state, not the "这个链接打不开" page. Non-owners still get 404 until a
  version exists.
- The first turn-end flush publishes the first version as usual.
- If creating the record fails or the user is not signed in, `cloudLink` is
  absent and the agent gives `link` as today.
- "Auto-publish is effective" means what it means today: signed in, enabled,
  and Claude Code (the only harness whose turn-end hook flushes). *My call*:
  other harnesses keep `link`, so no cloud snapshot is left frozen at its
  first version.
- The server's browser auto-open (`server/main.ts`, `linkFor()`) opens
  `cloudLink` when present, with the same-machine hint. *My call*: the cloud
  page is the entry point, and one artifact should not open in two tabs.
- `skills/artifacts/SKILL.md`: give `cloudLink` when present, otherwise
  `link`; the Auto-publish section's "give them `cloud.url` from
  `.ryugi/config.json`" becomes "give `cloudLink`". This is a skill edit:
  per `AGENTS.md`, it needs a baseline and an after run with the repo-local
  `writing-skills` skill, results kept with the change.

## Constraints

- Two repos: `ryugi` (server, CLI, viewer, skill) and `ryugi-cloud` (relay
  hub schema, presence, content proxy route, versionless artifacts for the
  owner, viewer bump).
- Order: `ryugi-cloud` accepts and forwards `local` first (no-op for old
  hosts); then a `ryugi-artifacts` release; then `ryugi-cloud` bumps its
  pinned viewer.
- Any change under `artifacts/src/` is a release (`AGENTS.md`, Releasing).
- Zero runtime dependencies in the plugin; the server may bundle npm deps.
- Old hosts with new clouds and new hosts with old clouds must keep working
  CF-only.
- Hub messages are capped at 12 MB.

## Left to the builder

- Direct-connect timeout and retry cadence.
- Exact message shapes for `local`, the `file` op and `cloudLink`.
- Whether to keep the relay viewer socket open while on the direct pipe.
- How the viewer source abstraction is shaped, as long as local and cloud
  pages share the layouts.
- Tests: protocol handling on both pipes, origin and key checks on
  `/relay`, fallback when direct fails.
