## Start and write

Resolve `app/` relative to this skill's directory to an absolute path. Every
artifacts command uses this launcher:

```bash
{{ADECK}} start --background --project-dir /path/to/project --artifact document/retry-policy
```

Run it before a new artifact's first file so they can see it take shape.
Add `--mockup` when the artifact will show phone screens: the writing
description then includes the device mockup guide.
Read the result: project, artifact, native source path, content state, actual
CLI/server versions, link state, and Check command. When content is missing,
the same response contains the complete, coherent writing description for that
type. Use its full block set and constraints. For documents, edit a temporary
LiteXML copy and run the printed `Save` command through the launcher. For an
existing document, pass the untouched pre-edit copy as `--base`. This captures
the agent making the revision. For other types, edit the native file directly.
The CLI package owns formats and examples. No separate format file is a gate.

Existing content omits the manual. Retrieve the same complete writing description
without starting a server through this launcher:

```bash
{{ADECK}} start --project-dir /path/to/project --artifact document/retry-policy --help
```

Use your task's type and ID. Use `<command> --help` or
`comment <action> --help` for inputs.
`get --project-dir <path>` discovers local artifacts without a server;
`get --artifact <type>/<id> --detail` reads complete native source; a
document prints as markdown with its heading outline, and `--source` prints
its LiteXML.

If a missing-content result lacks writing information, run `update --check`
and rerun start through the same launcher. If the latest available CLI still
lacks it, report the version gap instead of guessing formats. When a page and
server have mismatched versions, only comment until they match; update, restart
through the launcher and verify the reported versions before editing.

Re-read native files immediately before every edit. Patch only intended content,
preserve human edits and stable IDs. Comments and `.state/` are server-owned.
Then run the target's Check command. Fix issues; pending browser evidence or
merging is incomplete, not a successful check. Module warnings: run `modules`;
missing vocabulary returns its complete writing description, and `modules
--help` retrieves it too. Preserve unrelated project settings and module IDs.

Give the `Open` URL exactly as printed, including its key. `live_link_reserved`
is a reserved live link; `local_only` is local. Neither means a completed
publication. A separate Local URL is the fallback. Use `--no-open` headlessly.
Run start again only immediately before sharing a link. One machine server
serves all projects; stop affects every project and keeps their files.

## Read and apply feedback

Read default Brief directly; add `--format brief` if configuration overrides it.
Use JSON when a program consumes it and read its `data` envelope.

```bash
{{ADECK}} comment list --sections all --detail --project-dir /path/to/project --artifact document/retry-policy
```

Follow printed Read, More and other commands with their exact target, IDs,
snapshot and receipt. Read complete evidence, edit native content, Check,
then reply with what changed. Resolve only a settled ordinary thread.
Acknowledge only after using every delivered message; preview has no receipt,
ack resolves nothing and later replies remain unread. `changes` covers document
edits with the same explicit evidence/receipt boundary.

Apply submitted human answers and choices, then record the concrete settle note.
Drafts or withdrawn answers wait for the human. Never invent an answer or verdict.
A reject needs repaired evidence and a reply; leave it open for the human to pass.
Unknown writes need the printed state verification before retrying. Exit codes:
0 success, 1 failure, 2 human action, 3 issues, 4 incomplete, 5 partial, 130/143 interrupted.
