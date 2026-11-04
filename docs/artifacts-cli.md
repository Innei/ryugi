# Artifacts CLI

Open a project's saved artboards, documents and HTML pages without starting an agent session:

```bash
npx ryugi-artifacts
npx ryugi-artifacts /path/to/project
npx ryugi-artifacts --no-open
```

The local library shows content previews, type filters and title/id search across every registered project. Sort by newest update, oldest update or name. Previews load as their cards come into view; opening a card takes you to the full artifact. The server reads `.ryugi/artifacts/` in each registered project and keeps the library in sync with file changes.

The command reuses the machine's running server. Agent calls to `start --artifact …` return links without activating a browser tab when reusing a server; `--open` explicitly opens or focuses that artifact. Run from a subdirectory of a git repository, it uses the repository root's `.ryugi/artifacts/`, unless a directory between them already has its own. A new server stays in the terminal; Ctrl+C stops it and keeps your artifacts. Node.js is required.

The first successful server start while signed out recommends signing in to Ryugi Cloud for sharing and reviewing artifacts from other devices. Sign-in is optional and local work continues immediately. Run `npx ryugi-artifacts publish --login` in that project to get the sign-in URL. The recommendation appears once across projects on this machine, remembered as `login-hint-shown` beside the cloud credentials in the Ryugi configuration directory. Already signed-in accounts, help and version queries, and failed starts do not show it. Brief prints the recommendation and a `Sign in` command without blocking local work. Machine JSON carries the same warning and action in `warnings` and `next`.

Browser links use a stable random ID, such as `/document/<id>` or `/artboard/<id>?page=review`. The ID is 21 letters and digits, without `_` or `-`; IDs written by earlier releases are 32 hex characters (or carry `_`/`-`) and keep working. Files and CLI locators keep their readable slugs (`document/design-notes`). Each artifact stores its browser ID in `.artifact-id` inside its directory; keep that file when renaming or moving the directory within its type. Existing slug links still open and switch to the ID address. When duplicating an artifact as new work, omit `.artifact-id` from the copy so it receives its own ID; conflicting IDs are reported instead of choosing one copy.

Artboard page links restore the selected page on refresh and support browser back and forward. Page changes also carry into cloud share links. Agent updates preserve an open viewer's page, camera and comment draft; `activePage` and `focus` supply opening defaults. If the current page is deleted, the viewer falls back to an existing page.

## One server for the machine

One server serves every project on this machine and stays up until you stop it. It listens on the first free port of 27319, 27320 and 27321, and serves artboard boards from 27329, 27330 or 27331; `--port` picks another one, and `RYUGI_ARTIFACTS_PORTS` / `RYUGI_ARTIFACTS_BOARD_PORTS` replace the lists. `start` in a project registers that project with the server, starting the server first when none runs. Artifacts stay in each project's `.ryugi/artifacts/`.

The home page (the server's `url`) lists the artifacts of every registered project, newest first under "Recent · all projects", or one project at a time from the sidebar. Dormant projects (unused for 7 days) are folded; right-click a project to remove it from the list (its files stay). The search box searches this project or all projects, and ⌘K opens a palette grouped by project: ↵ opens, ⌘↵ opens in a new tab.

The status pill in the top bar shows the version, the cloud relay and an "Update" badge when npm has a newer release (checked once a day). Its panel shows uptime, address, relay, live pages and the registered projects, and has upgrade-and-restart, restart, stop and the server log, filterable by project.

`npx ryugi-artifacts stop` stops the server for every project; `--project-dir` is accepted and ignored. A `start` with a different version identity replaces the running server on the same port; an identical version reuses it. Server-wide options (`--host`, `--url-host`, `--port`, `RYUGI_CLOUD_ORIGIN`) that differ from the running server's replace it too.

The server keeps its state in `~/.ryugi/server/` (`RYUGI_SERVER_HOME` moves it): `projects.json`, the key, the log and `server-info`. Each registered project also gets `.ryugi/artifacts/.state/server-info` pointing at it. The first `start` of this release stops per-project servers from earlier releases; reload their open tabs once, because the port changes.

The same CLI runs what the skill uses: `npx ryugi-artifacts start`, `stop` and `publish` (`<command> --help` lists a command's options; add `--format json` for one JSON line). `npx ryugi-artifacts get <link>` reads a published Ryugi Cloud artifact with this machine's cloud sign-in and prints a bounded summary, including when piped. Follow its `Details` action for complete document content, or use `--source` for LiteXML. A local build of `ryugi-artifacts` can write gitignored copies to `skills/artifacts/app/`; the skill's launcher prefers a local `cli.cjs` over the npm release.

`ryugi-artifacts update` installs the newest release with the package manager that installed this one (npm, pnpm, yarn or bun, detected from the install path; `--pm` overrides it, `--check` only compares). For an npx, pnpm dlx or bunx run, a local build, or the launcher, it says how to update instead.

Cloud publish failures print their classified cause and any login or upgrade link in Brief. Machine JSON retains the HTTP status in `error.httpStatus` and quota facts in `error.details`. Account quota failures use `E_PLAN_LIMIT` and exit code 2; artifact storage exhaustion uses `E_ARTIFACT_STORAGE_LIMIT`, HTTP 413 and exit code 1. Auto-publish reports the same exhaustion reason immediately.

## License

Ryugi's skills, harness integrations and docs are under Ryugi License 1.0, which withholds all rights from the Restricted Parties in Schedule A and prohibits scraping them into a marketplace. `ryugi-artifacts` is proprietary (npm `license`: `UNLICENSED`) and not part of this repository; releases up to 1.51.2 were published under AGPL-3.0-only.

## Agent reading

Brief is the default for terminals, non-TTY shells and agents reading tool output.
Use `start --background` for one startup result. For foreground use, keep
`start --foreground` in the harness's background-shell mechanism and wait for
`Server: RUNNING` and its `Open` URL. Share the URL verbatim, including any key.

Read the printed summary, warnings, scope and effect states. Follow the executable
`Read`, `Details` and `More` commands for complete evidence or later pages. Once
all evidence has been used, the printed `Acknowledge` command consumes its exact
receipt; later edits and replies remain unread. Asks, groups and rounds are
independent current-state collections without receipts.

Brief record rows use labelled `name=value` cells. False and zero remain visible;
an explicit null is `none`, and absent optional cells are omitted. This also
applies to `--detail`, so recommendation and submission context remain readable.

Cloud `get` downloads nothing by default. Use `--source` for LiteXML or explicit
`--download --out NEW_DIRECTORY` for assets; save/download targets are never
silently overwritten.
Its printed Details action pins the version and preserves explicit section,
limit, field selection and comment exclusions.

Partial publication retains the successful URL and each target's effects.
Provided login or upgrade links for failed references are printed in full as
target-labelled actions. Resolve the affected target after inspecting those
effects; exit 5 does not mean that the main publication was rolled back.

## Machine consumers

When code such as `jq` or `JSON.parse` consumes output, explicitly select
`--format json` (`--json` is its exact alias). Every command uses the same
`ryugi.cli/v1` envelope: domain facts under `data`, with `outcome`, `effects`,
`page`, `omitted`, `warnings`, `next` and `error` alongside them. Live-event code
uses `start --foreground --format jsonl` and handles `ready` separately from the
terminal result. One JSON result is rejected for foreground services.

`--format brief|table|json|jsonl|raw` selects a supported renderer; `--quiet`
returns a declared scalar. Selection order is explicit flags, RYUGI_ARTIFACTS_FORMAT,
project output.format, global output.format, Brief. Persist brief/json/jsonl with
`config --output-format MODE`; project inherit removes its override. A write uses
the format selected before that write. Agents can add `--format brief` to override
a machine-oriented configuration for one call.

In JSON, complete thread reads return `data.items` and `data.receipt`; complete
diffs return `data.diff` and `data.receipt`. Preview, historical --all, projected
--fields and state reads have no receipt. JSON is available on demand; the skill's
ordinary decision-and-action flow reads Brief.

### Combined review reads

`comment list --sections all --detail` reads the applicable collections in one
CLI invocation and one server request: document threads/asks or artboard
threads/groups/rounds. Use a comma-separated selection to read fewer collections.
Each collection retains its own snapshot, bounded page, scope and continuation.
This does not claim a single atomic snapshot shared by all collections.

In JSON, the collections are under `data.sections.<name>`, with `items`,
`evidence`, `snapshot`, `page`, and an optional thread `receipt`. `next` contains
collection-labelled actions. Follow each `More` action as printed: it selects
one `--section` and its cursor, preserving limit/detail/history. A thread receipt
only acknowledges human evidence actually delivered on that complete page;
asks/groups/rounds, previews and historical reads have none. Reading never
acknowledges evidence automatically.

Command actions in `next` have `{kind: "command", label: string, argv: string[]}`.
Execute `argv[0]` with `argv.slice(1)` as separate arguments; labels are display
text. To continue manually, use `comment list --section NAME --cursor TOKEN`
with that collection's `page.nextCursor`, preserving the original `--detail`,
`--all`, and `--limit`. Acknowledge a consumed thread page with
`comment ack --artifact TYPE/ID --receipt RECEIPT`; other sections have no ack.
For a targeted group query use `--section groups --kind verify --detail`;
`--kind` and other filters are single-collection options.

Brief prints the artifact header once, per-collection coverage, labelled state
rows, and compact message metadata plus full multiline text. It preserves IDs,
authors, timestamps, anchors and other returned metadata without pretty JSON.
Filters, fields, thread IDs and existing cursors/snapshots require a single
`--section`; they are rejected on combined reads before network access.

The launcher probes the read-only version response for `ryugi.cli/v1` and
`data.capabilities` containing `reviewBundlesV1`. An older envelope alone does
not satisfy this contract; unsupported cached CLIs cannot execute the command.

### JSONL records and foreground ownership

Stdout contains UTF-8 JSON records separated by newlines. Buffer partial lines
across pipe chunks; parse each complete line independently. Stderr is diagnostic
output and can itself contain JSON-looking server logs; keep it separate.

Every stdout record has `schema: "ryugi.cli/v1"`, `kind` and `seq`.
The `command` identity is carried by meta, ready and result; progress and item
records belong to that same invocation and do not repeat `command`.
Sequence numbers start at 0 and increase within one invocation; they are not
reconnect or replay cursors. Dispatch on `kind`:

| kind       | Meaning                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `meta`     | Invocation identity; no domain result or readiness claim.                                                                                                  |
| `progress` | Optional `phase`, `current` and `total`; no terminal outcome.                                                                                              |
| `item`     | A finite collection's `collection` and one record in `data`. The terminal result omits that streamed collection.                                           |
| `ready`    | Foreground startup is ready. Read `data.status`, `data.reused`, `data.url`, `data.localUrl` and `data.cloud`, plus warnings and effects. Continue reading. |
| `result`   | The invocation's terminal envelope: `outcome`, `data`, effects, errors and next actions. A failure can arrive before any ready event.                      |

A new foreground server may produce the following sequence (example paths and URLs):

```jsonl
{"schema":"ryugi.cli/v1","command":"start","seq":0,"kind":"meta"}
{"schema":"ryugi.cli/v1","command":"start","outcome":"success","data":{"status":"running","scope":"machine","project":"/tmp/demo","reused":false,"url":"http://localhost:27319/document/example","localUrl":"http://localhost:27319/document/example","artifact":"document/demo","cloud":"local_only"},"effects":[{"operation":"start","target":"/tmp/demo","state":"confirmed"}],"seq":1,"kind":"ready"}
{"schema":"ryugi.cli/v1","command":"start","outcome":"error","data":{"status":"stopped","scope":"machine","project":"/tmp/demo","reused":false,"url":"http://localhost:27319/document/example","localUrl":"http://localhost:27319/document/example","artifact":"document/demo","cloud":"local_only"},"effects":[{"operation":"start","target":"/tmp/demo","state":"confirmed"}],"error":{"code":"E_INTERRUPTED","message":"Command interrupted by SIGTERM.","details":{"signal":"SIGTERM"}},"seq":2,"kind":"result"}
```

`data.url` is the shareable Open link, including any key; `data.localUrl` is
the local fallback. `data.cloud: live_link_reserved` describes a reservation,
not a completed publication. A ready envelope can have `outcome: attention`
when local startup succeeded with an optional sign-in warning.

The stream describes this invocation's lifecycle:

- If it starts a new server (`data.reused: false`), the foreground process owns
  that server and remains running. SIGINT or SIGTERM stops its child server,
  preserves artifact files, and normally emits a terminal
  `E_INTERRUPTED` with `error.details.signal`; process exits are 130 and 143.
  Cancellation is shutdown of this owned server, not a detach operation.
- If a matching server already runs, startup emits ready with
  `data.reused: true`, then a successful result with
  `data.status: running`, and exits 0. It does not attach a persistent
  subscription or take ownership of that server. EOF here does not mean the
  shared server stopped. Inspect the terminal status rather than treating every
  process exit as server shutdown.
- To keep a newly started server running after the caller exits, use
  `start --background` and consume its finite startup result. There is no
  foreground detach or replay API. Global `stop` is a separate action affecting
  every project; it is not subscription cleanup.

A consumer retains ready and terminal state separately, processes result even
when ready was never observed, and checks the process exit along with effects.
EOF without a terminal record leaves the invocation incomplete; inspect the
server/effects before retrying. Parse failures are not successful readiness.
Early argument/bootstrap errors may emit a result directly without meta.
