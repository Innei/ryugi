# Skill eval: Artboard mockups on a project with a design system

Date: 2026-10-24. Model: `deepseek/deepseek-flash`, thinking `auto` (resolved
`high`). Harness: OMP CLI 18.12.5 with its configured provider and the
installed skills, which link to this repo's `skills/` at `935347a`. No skill
was changed; this is a baseline that asks whether three proposed additions
are needed:

1. Tell the agent to reuse the project's design system (already in
   `brainstorming/SKILL.md` and `artifacts/SKILL.md`).
2. Tell the agent to screenshot the running app when the code does not show
   what the UI looks like.
3. Detect boards whose content overflows `w`×`h`, since `artboard.md` says
   nothing warns about clipping.

## Method

Each run used a fresh copy of the Yohaku repository without `node_modules`,
`.git` or `.ryugi`, re-initialised as a git repository. Yohaku has a root
`DESIGN.md` and `packages/design-system` (tokens, cheatsheet, `SKILL.md`,
`templates/scaffold.html`). Skills, rules and tools were left at their
defaults, so `using-ryugi` was available but not preloaded. OMP ran with
`--auto-approve --mode json --max-time 15m --print`.

Two prompts, two runs each:

- `friends`: 用 ryugi 的 artboard 给 yohaku 的友链页（/friends）出几个重新设计的方案。别问我问题，直接画。
- `related`: yohaku 的文章详情页末尾想加一个「相关文章」区域，用 ryugi 的 artboard 画几个方案给我挑。别问我问题，直接画。

Design-system use and self-checks were read from the tool calls. Each HTML
board was then opened headless at its declared `w`×`h` and measured: document
`scrollHeight`/`scrollWidth` against the frame, leaf text outside the frame,
and `overflow: hidden|clip` elements whose content exceeded their box
(ellipsis and line clamps excluded). Every flagged board was inspected from a
screenshot.

## Results

| Run | Time | Boards | Read design system | Frame overflow | Flagged clips | Screenshotted own boards |
|-----|------|--------|--------------------|----------------|---------------|--------------------------|
| friends-1 | 446 s | 4 | `DESIGN.md`, tokens, cheatsheet, scaffold | 0 | 2, decorative “07” numeral | yes |
| friends-2 | 373 s | 4 | `DESIGN.md`, design-system `SKILL.md`, tokens reference, cheatsheet | 0 | 0 | no |
| related-1 | 230 s | 4 | `DESIGN.md`, cheatsheet, `SKILL.md`, tokens | 0 | 2, decorative cover glyphs | no |
| related-2 | 384 s | 12 | `DESIGN.md`, tokens, cheatsheet, components reference | 0 | 1, horizontal rail labelled “滑动看全部” | yes |

All 24 boards fit their frames. Every flagged clip was intentional. Boards used
the static design-system palette (`--color-accent: #c56473`, paper
background, serif display type). They differ from the live site's orange
accent because that accent is injected at runtime by `apps/web`, not because
the tokens were ignored.

## Conclusions

- Addition 1 is already effective here; nothing to add.
- Addition 3 found no failure to fix: two runs never looked at their boards
  and still drew within their frames. It stays deferred until a clipped board
  is observed.
- Addition 2 was not exercised. Yohaku documents its design system at the
  root, the easiest case. A project with no design system and unclear styling
  is still untested.

Four runs on one project do not establish rates for other models, projects or
harnesses.

Raw OMP JSONL, run and measurement scripts, measurements, board screenshots,
live-site reference screenshots and the produced artboards are kept locally
under `.ryugi/evals/artboard-design-system-20261024/`.
