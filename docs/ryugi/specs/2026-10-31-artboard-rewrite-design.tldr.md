# TL;DR: Artboard rewrite

Spec: `2026-10-31-artboard-rewrite-design.md`.

## What gets built

1. The canvas keeps every board iframe mounted; off-screen boards are hidden,
   not unloaded; one transform on one element during gestures.
2. Boards idle for 5 minutes are captured and unloaded; boards that cannot be
   captured stay mounted.
3. Boards load from a same-site origin: a second local port, and
   `ryugi-content` on Cloud with `allow-same-origin`.
4. Cloud, when directly connected, embeds the whole local canvas.
5. The local server drops the access key on loopback (Host allowlist, Origin
   rules, `frame-ancestors`); local and Cloud mint ids with one function.

## What you'll see

1. Open the 30-board Cursor artboard and pinch: steady 60 fps, also with the
   pointer inside a board.
2. Open the Cloud link on this machine: same smoothness, boards load from
   localhost.
3. No title-text covers or blank boards anywhere.
4. Local links without `?key=`.

## Decisions

| Decision                                                     | By             |
| ------------------------------------------------------------ | -------------- |
| Rewrite, not patch                                           | you            |
| P95 ≥ 55 fps zoom target                                     | you            |
| Same-site board origin: second port, `ryugi-content`         | you            |
| Boards never through Cloudflare in direct mode               | you            |
| Embed the whole local canvas on Cloud direct                 | agreed         |
| 5 min idle unload, capture first, uncapturable never unloads | you + agreed   |
| No animation pausing during gestures                         | from benchmark |
| Drop the key, one id function, one project                   | you            |

## Check these (my calls)

- Embed iframe lives in the view frame; the shell is untouched.
- Phone uses the same idle-unload controller.
- Board port unreachable or non-loopback bind: fall back to one port with an
  opaque sandbox (~30 fps zoom).
- Host allowlist + Origin + `frame-ancestors` replace the key.
- `pnpm bench:zoom` needs local Chrome and stays out of CI.

## Time

About 4–5 working sessions: canvas and idle unload ~2, Cloud embed and key
removal ~2, tests, bench and release ~1. The slow parts are the two-step
release (Cloud, then npm) and your trackpad pass.
