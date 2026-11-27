# ZCode Tool Mapping

Skills speak in actions ("invoke a skill", "dispatch a subagent", "create a todo", "read a file"). On ZCode these resolve to the tools below.

| Action skills request                                        | ZCode equivalent                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Read a file                                                  | `Read`                                                                                                   |
| Create a new file                                            | `Write`                                                                                                  |
| Edit a file                                                  | `Edit` (or `ApplyPatch` for unified multi-hunk patches)                                                  |
| Run a shell command                                          | `Bash`                                                                                                   |
| Search file contents                                         | `Grep`                                                                                                   |
| Find files by path or pattern                                | `Glob`                                                                                                   |
| Fetch a URL                                                  | `WebFetch`                                                                                               |
| Search the web                                               | `WebSearch`                                                                                              |
| Ask your human partner a structured question                 | `AskUserQuestion`                                                                                        |
| Invoke a skill (`Skill` tool)                                | ZCode's native `Skill` tool (`adeck:<skill>`)                                                            |
| Create / update todos (`TodoWrite`)                          | `TodoWrite` and `TodoRead`                                                                               |
| Dispatch a subagent (`Subagent (general-purpose):` template) | `Agent` (or `Task`, plus `TaskOutput` / `TaskStop` for background task management)                       |
| Interactive artifacts (artboard, doc, whiteboard, verify)    | Use `Bash` with the `adeck:artifacts` launcher (`node <skill-dir>/app/adeck.cjs ...`); read comments on request via `comment list` |

## Comment delivery on ZCode

ZCode runs hooks synchronously on lifecycle events and does not expose a live inbound push pipe to wake an idle desktop session. After opening an artifact and sharing its URL, tell your human partner to reply in chat when they have finished commenting or submitting choices, then read their feedback with `comment list --sections all --detail` and acknowledge consumed receipts with `comment ack`.
