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
CLI/server versions and link state. When content is missing,
the same response contains the complete, coherent writing description for that
type. Use its full block set and constraints. For documents, edit a temporary
LiteXML copy and save it with `write-document --artifact document/<id> --input
<edited.xml>` through the launcher. For an existing document, pass the untouched
pre-edit copy as `--base`. This captures the agent making the revision. For other types, edit the native file directly.
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

Your human partner and the server write these files too: browser edits,
autosave, normalization. `write-document` refuses a `--base` that no longer
matches; other types are written directly, with no such check. How much to read
before an edit is your call. Patch only intended content, preserve human edits
and stable IDs. Comments and `.state/` are server-owned. Then run
`check --artifact <type>/<id>`. Fix issues; pending browser evidence or
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

Brief prints results, evidence and handles, never next steps. A page that
continues names its `cursor`: pass it with `--cursor` and the same options; a
cursor printed under one section of `--sections all` belongs to that section,
so pass `--section <that section>` in place of `--sections all`. A
preview names its `snapshot`: read a thread whole with `comment read --thread
<id> --snapshot <snapshot> --detail`. A complete read delivers its threads to
you. Read complete evidence, edit native content, check, then reply with what
changed: `comment reply --thread <id> --text <message>`; `comment resolve
--thread <id>` closes a thread. Reply and resolve spend what was delivered to you; a human message
that arrived after your read stays unread. Every open thread gets a reply or a
resolve, also one you answered in the terminal. Resolve refuses while a thread
holds a message you never received; resolve only a settled ordinary thread.
`changes` prints a receipt: run `changes ack --receipt <receipt>` after using
the diff.

Apply submitted human answers and choices, then record the concrete settle note.
Drafts or withdrawn answers wait for the human. Never invent an answer or verdict.
A reject needs repaired evidence and a reply; leave it open for the human to pass.
After an unknown write effect, read the state (`comment list --sections all --detail`)
before retrying. Exit codes:
0 success, 1 failure, 2 human action, 3 issues, 4 incomplete, 5 partial, 130/143 interrupted.
