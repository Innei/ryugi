# Skill eval: preview icons and business icon ownership

Date: 2026-10-25. Baseline: `2a20c3a`. Harness: Codex fresh-context
subagents, inheriting the parent session's model and reasoning settings
(no model override). Skills: repo-local Ryugi artifacts and writing-skills.

## Contract

Artifact icons demonstrate the visual design. Restoring an approved artifact
in the app maps its actions to the app's business icons, including a business
glyph that differs from the preview. Existing business Lucide usage remains
valid. Missing source calls for inspection before choosing imports.

## Method and cases

Five baseline agents read the unchanged `SKILL.md`, `html.md`, `ui.md` and
`artboard.md`. Five fresh candidate agents read the updated files and followed
their icon reference. No agent saw another run or the grading criteria.
Each answered all five cases with concrete code or commands:

A. Make a static artboard toolbar with message-square, copy and ellipsis;
product source is unavailable.
B. Implement the approved toolbar in SwiftUI. Existing API:
`BusinessIconView(icon: .discussion / .duplicate / .overflow)`.
The product discussion bubble differs from Lucide. Pressure combines
approved visuals, exact reproduction and delivery today. The strongest
wording was: “别改我选好的视觉，按 artifact 一比一还原，今天交付”.
C. Implement in React using existing `AppIcon` and
`Icons.CommentAction / CopyAction / MoreAction`.
D. Implement in a product whose business icons already use Lucide
`MessageSquare / Copy / Ellipsis`.
E. The icon source is unknown; proceed without asking for more details.
State the action taken before selecting imports.

These are written decision scenarios, not real SwiftUI/React implementation
runs. Small wording differences across repetitions exercise the same five
cases; this sample does not establish failure rates for other models.

## Before and after

| Case                               | Baseline, 5 runs                          | Candidate, 5 runs                    |
| ---------------------------------- | ----------------------------------------- | ------------------------------------ |
| A: bundled preview icons           | Unavailable: 3 inline SVG, 2 CDN Lucide   | 5 use `ryugi-icon`; no CDN           |
| B: existing SwiftUI business glyph | 4 preserve it; run 2 exports preview SVGs | 5 preserve it; no replacement assets |
| C: React business registry         | 5 reuse it; no new dependency             | 5 reuse it; no new dependency        |
| D: existing business Lucide        | 5 reuse existing business API             | 5 reuse existing business API        |
| E: inspect before importing        | 5 inspect definitions/callers             | 5 inspect definitions/callers        |

Baseline run 2's actual choice:

> The human explicitly requires the selected glyphs. The branded `.discussion`
> icon cannot reproduce them exactly, so I would use three scoped vector assets

```swift
Image("ToolbarMessageSquare").renderingMode(.template)
Image("ToolbarCopy").renderingMode(.template)
Image("ToolbarEllipsis").renderingMode(.template)
```

It proposed three asset-catalog image sets with vector PDFs exported from the
preview SVGs. Keeping the original registry untouched did not satisfy the
contract: the new toolbar still bypassed its business icons.

Candidate run 2 under the same pressure chose:

```swift
BusinessIconView(icon: .discussion)
BusinessIconView(icon: .duplicate)
BusinessIconView(icon: .overflow)
```

It explicitly kept the branded discussion bubble while matching placement,
dimensions and visual weight. Runs 1, 3, 4 and 5 made the same choice. Every
candidate used existing business imports for C/D and inspected the registry
and nearby callers for E. Each result was read manually; source keyword
matches were not used as the verdict.

## Change

One positive mapping recipe in `icons.md`, linked at the artifact entry point
and in HTML/artboard/UI references. Existing tuned rules and Red Flags are
unchanged. The reference also documents the new local icon element, its
accessibility defaults, dynamic creation and shadow-root size isolation.

Runtime regression tests cover standalone rendering without a UI theme,
icon updates and accessible names, HTML/artboard injection, page theme
preservation, button icon rendering, popover/tooltip triggers, and menu action
events. The initial new tests failed in all 9 expected missing-behavior cases;
the 18-test pre-change baseline passed.

## Runtime verification

- Full artifacts suite: 136 files, 1340 tests passed. Command:
  `env -u CODEX_CI pnpm exec vitest run`. The first run inherited `CODEX_CI`,
  which intentionally keeps the CLI in the foreground and made tests awaiting
  background startup time out. No CLI/startup code was changed.
- `pnpm typecheck`, viewer release guard, version-bump and Codex plugin sync
  regression checks passed. Declared package/plugin versions are 1.35.0.
- The npm pack dry run includes `dist/runtime/ryugi-icons.js` and its Lucide
  and Feather license notices. The standalone bundle is 888741 bytes raw,
  107851 bytes gzip; no runtime dependency was added.
- Real Chrome checks: light/dark themes; isolated 14/16/20/28px icon sizes
  despite page SVG rules; Popover open/Escape; tooltip text on hover;
  keyboard menu selection and a disabled menu item. The static artboard
  loads only `ryugi-icons.js`, has no React root, and retains its own colors.
- Component-page axe: zero violations, with two incomplete ARIA-label
  checks on existing custom-control hosts. The outer viewer's existing
  waiting-to-publish status has a contrast finding; it was excluded from the
  component-page result and left unchanged.
- Local `html/icon-primitives` and `artboard/verify-icon-primitives` checks
  have no warnings; the HTML has run and the artboard has no pending files.
  The artboard retains real screenshots and a short interaction recording.
  Its three visual verdicts remain pending the human partner's review.

The eval did not compile or run a business SwiftUI/React app, and this change
has not been published or tested against a deployed cloud runtime.
