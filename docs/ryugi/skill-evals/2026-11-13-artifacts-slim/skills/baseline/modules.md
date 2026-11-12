# Modules

A module is a business area a teammate would name when asking "what did we
decide about X": billing, sharing, the viewer. Not a file, a feature flag, a
task or a ticket. Each artifact is tagged with the modules it serves, so
your human partner can filter their Ryugi Cloud library by module.

The project's modules live in `<project>/.ryugi/modules.json`. You write
that file and keep it current.

```json
{
  "modules": [
    {
      "id": "billing",
      "name": "Billing",
      "description": "Plans, quotas, invoices and the upgrade flow.",
      "paths": ["src/billing/**"],
      "aliases": []
    }
  ],
  "version": 1
}
```

## What each `check` line asks for

- `no module`: list the modules and set this artifact's. Choose by what it
  is about, from each description and paths. At most 3.

  ```bash
  node app/ryugi.cjs modules --project-dir /path/to/project
  node app/ryugi.cjs modules --project-dir /path/to/project --artifact document/quota-design --set billing
  ```

- `no vocabulary`: create `modules.json` first: 5–15 modules drafted from
  the repository's structure, its docs and the titles of existing
  artifacts, each with a description and paths. Then tag.
- `module no longer in the vocabulary`: set the artifact's modules again.

`--set` replaces what was there; `--set ""` clears it. Set again when later
work moves an artifact's subject to another module.

## Changing the list

Before adding a module, read the counts and hints `modules` prints. Add one
only when no description fits and the area will outlive the current task. A
module with no artifacts, or two that keep being chosen together, is a merge
to make in the same edit.

| Change | Edit                                                           | Artifacts tagged earlier   |
| ------ | -------------------------------------------------------------- | -------------------------- |
| Rename | change `name`, keep `id`                                       | show the new name          |
| Merge  | delete module B, add `"b"` to A's `aliases`                    | B's artifacts show under A |
| Split  | delete module A, create A1 and A2, add `"a"` to both `aliases` | show under both A1 and A2  |
| Remove | delete the module, no alias                                    | show a greyed retired id   |

- Never reuse or change an id.
- Fix what a hint points at when the edit is clear; leave a judgment about
  the business to your human partner and say so.
- Name every edit to `modules.json` in your report for the turn. The file is
  committed with the rest of the work, by whoever commits.
