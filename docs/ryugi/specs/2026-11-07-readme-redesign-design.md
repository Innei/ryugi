# README redesign: lead with the artifacts (Nov 7, 2026)

## Intent

A developer who lands on github.com/Innei/ryugi cannot tell in one look
what Ryugi does for them. The README opens with "a skills collection",
shows a 34%-zoomed artboard whose text is unreadable at GitHub's column
width, and nowhere shows the agent and the human working together, which
is the whole point. The artifacts are what we promote now; the README
must say and show that first.

**The one message:** your coding agent puts its options, docs and results
on pages you can see; you pick, comment and pass, and it builds from that.

## Goals

- In the first screen (tagline + hero), a visitor sees one full loop:
  they ask, the agent draws options, they pick, it builds, they pass.
- Every screenshot's UI text is readable at GitHub's README width
  (about 880 CSS px) on a laptop.
- All media come from one demo scenario, so the README tells one story.
- Every artifact type the app ships has a section, including the
  whiteboard (missing today).

## Non-goals

- The launch video. Its footage is not cut in; its kit (staging, takes,
  compositor) is reused.
- Changes to `docs/workflow.md`, `docs/install.md` or other docs.
- A Chinese README.

## Anti-goals

- No faux Ryugi UI. Only the terminal is mocked, as in the launch video.
- No browser chrome around the app, no gradients, no warm cream/clay
  palette. Neutral ground, as in the launch video.
- No text in the media that the README text then repeats word for word.
- None of the known rough edges on camera (see Constraints).

## Decided by the user

- Lead with the artifacts; skills move to a short section near the end.
- Description, presentation and every screenshot may change.
- Animated hero is fine; mp4 is acceptable.
- Do not reuse the launch video itself.
- The presentation form is the builder's (my) call; the calls are below.

## Presentation (my calls)

### Hero: a 20 s loop, animated WebP

An animated WebP in a `<p align="center"><img>`, because GitHub plays it
inline, muted and looping, while an mp4 in a README needs a click. It
replaces `hero-light.webp` / `hero-dark.webp` at the top, directly under
the tagline.

Story, one loop on the artboard (the "choose instead of imagine" claim):

| #   | ~s  | Front    | On screen                                                                                                                      | Caption                 |
| --- | --- | -------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| 1   | 3   | terminal | The human types `Mock up notification settings.`; agent line `Write(…/notify-settings/canvas.json)`                            | —                       |
| 2   | 5   | browser  | Three layout directions stream onto the artboard as a choice group, the agent's pointer and pet moving board to board          | "It draws the options." |
| 3   | 4   | browser  | The human's cursor picks one radio, the bar reads 1/1 chosen, presses Submit                                                   | "You pick."             |
| 4   | 2   | terminal | `ryugi · round 1 submitted: q1 → b`, then `Bash(pnpm test)` / `14 passed`                                                      | —                       |
| 5   | 5   | browser  | A verify group appears: the approved board next to the built page. The human presses Pass; terminal notice `ryugi · v1 passed` | "You pass. It ships."   |

- Same staging as the launch video: two windows on #e7e7ea, the browser
  large top-left with no chrome, the mock Claude Code terminal smaller
  bottom-right; the active window comes forward.
- Captions: the launch video's style (white text on rgba(10,10,10,.78),
  10 px radius), scaled to the output size; at most 4 words.
- No title or end card; the last frame cuts back to the first.
- Output: 1600×900, 15 fps, ≤ 5 MB. If quality at 5 MB is poor, drop to
  1280×720 before dropping frame rate. Light only: the framed ground
  reads on both GitHub themes.
- Alt text describes the loop in one sentence.

### Section stills: one close-up per surface, light and dark

Six sections, in this order: Artboard, Document, Whiteboard, HTML, Verify,
Library. Each gets one still in `<picture>` with light and dark sources.

- Captured from the real app at 1280×800 CSS px, device scale 2.
- Cropped to the region that makes the section's point, at most 1100 CSS
  px wide, so UI text stays near 1:1 at README width. Not the full window.
- No terminal, no captions, no annotations in stills.
- WebP, ≤ 250 KB each.

| Section    | The still shows                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Artboard   | One choice group close up: three boards with radios, the recommended tag, a sticky with the why, and the round bar with Submit                  |
| Document   | `notify-design`: a paragraph with an inline question answered, and one margin comment thread "Waiting on you"                                   |
| Whiteboard | `notify-flow`: the agent's frames (trigger, queue, delivery), the human's own box and arrow beside them, the "Agent changed N" pill             |
| HTML       | A one-surface bench from the same scenario, e.g. the settings toggle's spring or the digest send-time picker, with its `<ryugi-…>` controls set |
| Verify     | The verify group: the approved board next to the built page, Pass and Reject on the group label                                                 |
| Library    | The home: project rail, type filters, a grid of this scenario's artboard, document, whiteboard and html cards                                   |

### README text

Keep the structure of the uncommitted draft in the working tree (tagline,
hero, two problem/answer paragraphs, install, surface sections with a
bold "Use it when" line, "The skills behind it", harnesses, credits,
license), with these changes:

- Hero picture → the animated WebP.
- Add a Whiteboard section after Document: **Use it when** the parts and
  arrows are still the question. One or two sentences: you both draw on
  it; select what you drew and ask the agent about it.
- Each section's body is at most two sentences; the still carries the rest.
- Artboard section gets its own still (today it borrows the hero).
- Harnesses, Credits and License sections stay verbatim.

## Constraints

- Demo content is English; no CJK anywhere in media or README.
- Known rough edges to keep out of frame (from the launch-video ledger):
  - The doc editor's font menu shows a hardcoded "默认" label: crop the
    Document still below the toolbar.
  - The doc → whiteboard frame split zooms to the wrong place: not used.
  - "Waiting to publish" on Share when signed in: run the hub signed out
    (`XDG_CONFIG_HOME` pointed at the kit's `xdg/`).
- Record against the current npm release of `ryugi-artifacts`, so what the
  README shows is what `npx ryugi-artifacts` installs.
- `docs/images/` total stays under 8 MB.

## How it gets made

1. **Stage.** Reuse `/Users/innei/ryugi-launch-video` (kit, demo project
   `notify-demo`, isolated chrome profile and `xdg/`). Put new scripts and
   takes under `/Users/innei/ryugi-launch-video/readme/`. Add the states
   the hero and stills need (three-direction choice round, verify group,
   html bench) to `notify-demo` with unique ids; `check` each clean.
2. **Hero.** Script the agent side (`kit/stage/timeline.mjs` pattern) and
   drive the human side with `kit/take.mjs`; composite with the kit's
   renderer; encode to animated WebP (`ffmpeg -c:v libwebp_anim` or
   `img2webp`), loop forever.
3. **Stills.** Capture each state in light and dark through the same CDP
   setup, crop, encode.
4. **README.** Edit `README.md`; replace `docs/images/*` (delete
   `hero-*.webp`, add `hero.webp`, add `artboard-*.webp`,
   `whiteboard-*.webp`, replace the rest).
5. **Review.** A verify group on `artboard/readme-redesign` in this repo:
   the hero (image board) and the six stills; plus a rendered preview of
   the README (GitHub markdown at 880 px, light and dark) as boards. The
   human passes or rejects. Nothing is committed before the pass.

## Left to the builder

- Exact demo copy, board contents, the html bench's subject.
- Takes, timing within ±3 s per beat, crop rectangles.
- Encoder settings within the size limits.

## Artifacts used in this conversation

- `artboard/readme-redesign` (this repo): started, empty; becomes the
  review page.
- Reference only: the launch video spec
  `/Users/innei/git/innei-repo/ryugi-cloud/docs/ryugi/specs/2026-11-05-launch-video-design.md`
  and its ledger `/Users/innei/git/innei-repo/ryugi-cloud/.ryugi/sdd/2026-11-05-launch-video-design/progress.md`.
