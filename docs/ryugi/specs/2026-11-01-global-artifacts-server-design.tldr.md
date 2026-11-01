# TL;DR: Global artifacts server

Spec: `2026-11-01-global-artifacts-server-design.md`.

## What gets built

One resident artifacts server per machine on a fixed port, instead of one per
project. The local home page finds artifacts across projects and manages the
server. Cloud pages on this machine connect to the fixed port directly and
never touch the Durable Object; the DO only relays for other devices. A DO
rejection says why and stops retrying.

## What you'll see

1. One artifacts server in `ps`, however many projects are open.
2. The local address is always `http://localhost:27319/`.
3. The home page: a project sidebar with "Recent · all projects" on top; ⌘K
   searches every project.
4. A status pill top right (version, relay); its panel upgrades, restarts,
   stops, shows the log, removes project registrations.
5. Cloud pages stay online overnight; 20 cloud tabs on this machine are all
   live, no 429.
6. On the phone, a DO rejection reads "connections full" or "allowance used"
   with a reconnect button.

## Decisions

| Decision                                                                                                   | By                             |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------ |
| One resident server; `monitor` removed                                                                     | you                            |
| Artifacts stay in each project's `.ryugi/artifacts/`                                                       | you                            |
| Local pages probe fixed ports, no DO; no mDNS                                                              | you                            |
| 429 from the DO: no retry, explicit message                                                                | you                            |
| Ports 27319-27321, board 27329-27331                                                                       | you                            |
| Home page for finding artifacts: project sidebar + "Recent" + ⌘K                                           | you (artboard)                 |
| Status pill with dropdown panel                                                                            | you (artboard)                 |
| Links without project, owner-only probe, registry + dormancy, upgrade-only rule, four management areas     | you (accepted recommendations) |
| Cloud ships first and stays compatible with old servers; `--host` is server-wide; project sidebar ordering | you (confirmed)                |

## Check these (my calls)

- Windows runs detached (not tested on Windows); Codex reuses or runs in the
  foreground.
- "No local server here" is remembered only when you deny the permission;
  unreachable ports just back off and retry.
- A compatibility `server-info` in each registered project keeps old hooks
  working.
- `--host`, `--url-host`, `RYUGI_CLOUD_ORIGIN` mismatches replace the server;
  open settings travel per request.
- Session-start launches the server when signed in and the project has
  published artifacts.

## Time

About a day and a half: server and CLI 5-6 h, home page 3-4 h, ryugi-cloud
2-3 h, plus two releases.
