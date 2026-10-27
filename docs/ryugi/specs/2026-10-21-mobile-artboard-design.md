# Artboards on the phone: open on the question, jump between questions, read one board at a time

Agreed with the human partner on 2026-10-21 on the artboard
`artboard/mobile-everything` (round 1 `q1-b`, round 2 `r2-b1` … `r2-b3`).

## Why

This is project 3 of 3 (project 1: auto-publish; project 2: owner editing on
the cloud, which already gave documents a phone layout). The human partner
drives this computer from a phone and opens artifacts there, locally or on
ryugi.innei.dev.

On a phone today (checked at iPhone 14 width, recorded on the artboard's
现状 page):

- The **artifact list** works: one column, thumbnails, filters fit.
- An **artboard** opens fitted to the whole page, around 8% zoom, so every
  board is a smudge. One finger drag draws a selection box instead of moving
  the canvas, and there is no pinch zoom, so there is no way in.
- An **HTML page** is the agent's page in a full-screen frame. Pages drawn at
  desktop width are cut off on a phone; that is the page's business, not the
  viewer's.

## Goals

- An artboard is usable on a phone: it opens on the question the agent last
  pointed at, the human partner can step through questions and jump to any
  question of any round, and can read one board at a time full screen. They
  then tell the agent in chat what they picked ("q2r4 → a"), as today.
- The same behaviour wherever the artboard view renders: the local viewer and
  the cloud page (owner and visitors).
- Touch works on the canvas: one finger pans, two fingers pinch zoom.

## Non-goals

- HTML pages: no change (decided). A desktop-width page stays as the page
  draws it.
- The artifact list: no change; it already works.
- Documents: done in project 2.
- Selecting elements, the Inspector, or tweaks on the phone (decided: hidden).
- Moving boards, editing canvas.json, or picking options from the phone; the
  artboard stays read-only for the human partner, as on desktop.

## Anti-goals

- **Card UI** (standing preference): no rounded, filled or shadowed boxes in
  the new phone UI. Flat rows, hairline dividers, text for state. The bottom
  sheet comes from `@lobehub/ui` `FloatingSheet`, as in project 2.
- **A second artboard model.** The phone reads the same canvas.json and
  layout.json; nothing new is written by the agent for phones, and skill text
  does not change.
- **Breaking desktop.** Desktop behaviour (tools, Inspector, selection sync,
  keyboard shortcuts) is unchanged at desktop widths with a mouse.

## Decided with the human partner

| Topic                                      | Decision                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| How to browse an artboard on the phone     | keep the canvas, add a jump panel (`q1-b`), not a list or a swipe deck |
| Details of that                            | as drawn in `r2-b1` … `r2-b3` (approved)                               |
| HTML pages on the phone                    | no change                                                              |
| Inspector / element selection on the phone | hidden                                                                 |
| Visual style                               | no cards                                                               |

## How it behaves

Phone layout means viewport width ≤ 640px (_my call_, the same breakpoint as
documents in project 2).

### Opening (`r2-b1`)

- The canvas opens zoomed to fit one question rather than the whole page:
  the group named by `canvas.focus` (or the group containing the focused
  board); if focus names nothing on the page, the first question of the
  newest round, i.e. the first row of the jump list (as drawn on the approved
  round; the newest round is the bottom-most one by the artboard's layout
  rules). An artboard with no groups keeps today's fit-the-page.
- Later `focus` changes from the agent still move the camera, fitted the same
  way.

### The question bar (`r2-b1`)

- A bar at the bottom shows the current question: its id and title
  (`q2r4 怎么开始一条评论`) and `‹ 上一题` / `下一题 ›`.
- Previous / next follow the jump list order (below) and fit the canvas to
  that question; they stop at the ends of the list rather than wrapping
  (_my call_). "Current question" is the one last jumped to or opened on;
  panning by hand does not change it (_my call_).

### The jump panel (`r2-b2`)

- Dragging the bar up opens it as a sheet (`FloatingSheet`, embedded variant;
  collapsed = the bar, open = about two thirds of the screen; _my call_ on the
  heights).
- It lists every question on the current page, grouped under its round, newest
  round first. A round is the title note above a group: each group belongs to
  the nearest `kind: "title"` note above its frame on the same page (_my
  call_); groups with no title above them come last under "其他". Within a
  round, questions run top to bottom, then left to right. Each row:
  group id, title, number of boards. The current question is highlighted.
- Boards that belong to no group appear as their own rows under their round,
  so nothing on the canvas is unreachable (_my call_).
- The sheet header has the page switcher when the artboard has more than one
  page; switching pages lists that page's questions.
- Tapping a row fits the canvas to that question and collapses the sheet.

### One board full screen (`r2-b3`)

- Tapping a board on the canvas opens the existing enlarged board view, full
  screen: header with the board title, id and a close button; footer with
  `‹ 上一张` / `n / m` / `下一张 ›` through the boards of the same question
  (for a board outside any group, through its neighbours in the jump list;
  _my call_).
- A phone-width board shows at 1:1. A wider board is scaled to the screen
  width and scrolls vertically; pinch zooms inside it (_my call_).
- `interactive: true` boards are playable in this view, as they are expanded
  on desktop. On the phone canvas a tap always opens the board; there is no
  separate PLAY step (_my call_).

### Top bar on the phone

- A flat, full-width bar as drawn in `r2-b1`: artboard title, the page
  switcher (current page name and ▾) when the artboard has more than one
  page, live indicator, zoom level, publish / share. Today's floating, rounded,
  shadowed toolbar boxes are not used at phone width (no-card rule). The same
  page switcher also sits in the jump panel's header.

### What is hidden on the phone

- The Select and Hand tools, the Inspector toggle and panel, node selection,
  the selection marquee, and hover node IDs. Selection sync never starts on a
  phone, so nothing the phone does writes `selection.json`.
- Kept (in the phone top bar): page switcher, live indicator, zoom menu,
  publish / share.

### Touch (_my call_)

- Phone layout: one finger pans the canvas anywhere (boards included, since
  selection is off and board frames do not take pointer input there), two
  fingers pinch zoom around their midpoint, a tap on a board opens it.
- Desktop layout with a touch screen: the same pan and pinch on the canvas
  background and whenever the Select tool is not active; with Select active,
  a touch on a board stays a selection as today. This keeps the injected
  board runtime unchanged.
- Mouse and trackpad behaviour is unchanged.

## Constraints

- Zero-dependency plugin; the viewer may use what it already bundles
  (`@lobehub/ui` FloatingSheet, StyleX).
- `ArtboardView` serves both the local viewer and the cloud page
  (`CloudLayout`), so the phone behaviour lives there and works without a
  live connection (the cloud page has no `send`).
- React components under 300 lines, files under 500; `ArtboardLayout.tsx` is
  already 302 lines, so the phone pieces go in their own components and
  hooks.
- No skill text changes are expected; if any are needed they go through
  `writing-skills` with baseline and after runs.
- Release: a viewer change under `artifacts/src/` ships as a ryugi release;
  ryugi-cloud then pins the new `ryugi-artifacts` version and deploys.

## Left to the builder

- Sheet heights and snap points, gesture thresholds (tap vs pan), pinch zoom
  limits.
- How rounds are computed from layout.json geometry, within the rule above.
- How the enlarged view scales and pans wide boards.
