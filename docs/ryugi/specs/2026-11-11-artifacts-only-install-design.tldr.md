# TL;DR: artifacts-only install

**What gets built:** a second Claude Code plugin entry, `ryugi-artifacts`,
from the same repository, exposing only `artifacts` and `interface-craft`;
and `npx ryugi-artifacts install`, which asks for a mode and installs the
matching entry.

## What you'll see

1. Run `npx ryugi-artifacts install`, press Enter: artifacts only (or full, if `ryugi` is already enabled).
2. New session: only `ryugi:artifacts` and `ryugi:interface-craft`; no brainstorming bootstrap.
3. Ask for directions: an artboard opens; comments come back.
4. Run install again with full: `ryugi-artifacts` is disabled, `ryugi` enabled.

## Decisions

| Decision       | Choice                                                   | By   |
| -------------- | -------------------------------------------------------- | ---- |
| Repository     | no split, nothing moves                                  | you  |
| Mechanism      | same plugin, mode chosen at install                      | you  |
| Kata split     | void                                                     | you  |
| How            | second marketplace entry restricting `skills` (verified) | mine |
| Installer home | `ryugi-cloud` npm CLI                                    | mine |

## Check these

- Artifacts-only is Claude Code only this round.
- The installer manages user scope only; other scopes get a warning.
- Default follows the installed variant; leaving full asks again.
- interface-craft's references to workflow skills stay; acceptance checks them.
- Launch target is my assumption: X demo for front-end Claude Code users.

**Estimate:** 2–3 h here, 2–3 h in `ryugi-cloud`, 1 h acceptance; landing extra.
