# Artifact Toast: reference eval and runtime checks

Date: 2026-10-25. Harness: Codex fresh-context subagents, inherited parent
model/effort, no override. Skills: repo-local artifacts and writing-skills.
Baseline: the current unpublished icon/UI changes, without Toast support.

## Reference eval

One baseline and one fresh candidate read `SKILL.md`, `html.md`, `ui.md`.
The same task asked for an HTML artifact's saved/error notifications, a
stable notification across repeated saves, and the necessary runtime/readiness
markup. No agent saw another run or grading instructions. This is a reference
retrieval/application check, not a compliance-rate experiment or an app build.

Baseline: “The docs provide no toast API.” It wrote a fixed HTML notification,
CSS colors, an `aria-live` region, and a timer-reset helper.

Candidate: used `<meta name="ryugi-ui" content="1">`, waited for
`ryugi-ui:ready`, then called `window.ryugiToast.success/error` with the same
`id: 'save-result'`. No invented `ryugi-toast` tag, custom toast DOM or timer.
The handler used the page's own save operation. The answer was read manually.

## Runtime

Reuse Lobe UI's `ToastHost` inside the existing shared root. A small adapter
exposes success/error/info/warning/loading/dismiss on `window.ryugiToast` and
normalizes string or description-only messages into accessible titles.
The host hides empty notification landmarks and uses readable description
colors. No dependencies or second React root were added.

- Pre-change runtime baseline: 8 existing tests passed.
- RED: all 3 initial Toast tests failed because the API was missing.
- GREEN: startup calls, plain-text success/error rendering, stable-id updates
  and handle closure passed with the real runtime and components.
- Browser axe found unnamed string-message dialogs, duplicate empty landmarks,
  and low description contrast. A fourth test reproduced the missing name
  before the adapter/style fix; string and description-only messages now have
  accessible names.
- Full artifacts suite: 137 files, 1344 tests passed with `CODEX_CI` unset.
  Typecheck and diff whitespace checks passed. The additional description-only
  assertion also passed in the focused Toast suite.
- Chrome: success/error and loading, repeated-id updates, automatic dismissal,
  manual dismissal, light/dark theme, and keyboard focus/close were exercised.
  The automation tab was explicitly activated for animation completion;
  background-tab animation suspension is not a product failure.
- Final Toast-page axe: zero violations. Its remaining incomplete check is
  the library's initially ARIA-hidden close button; focusing the Toast and
  tabbing exposed the button with `aria-hidden="false"`, and Escape started
  dismissal.

Local HTML `toast-notifications` and the appended `toast` verify group retain
real screenshots and a short recording. Visual verdict remains the human
partner's. This change is not published or checked on a deployed cloud runtime.

## Page typography regression

The reported screenshot exposed a missed collision: the demo's unlayered
`h2` and `p` rules overrode Lobe UI's layered CSS. Titles became 17px with
12px bottom margins, descriptions gained 20px bottom margins, and each card
grew to 101px. The earlier single-card captures did not catch this defect.

`ToastHost` now portals into an open ShadowRoot containing the existing
runtime stylesheet. It retains the shared React root and inherited theme
variables while isolating notification selectors from page CSS.

- RED: the new page-typography regression failed with an 80px title.
- GREEN: all 13 focused Toast/runtime tests passed, including that regression.
- Full artifacts suite: 137 files, 1345 tests passed; typecheck passed.
- Chrome: a page rule forcing `h2,p` to 80px with 88px margins, even with
  `!important`, leaves Toast titles at 14px and descriptions at 13px.
  Card height is 69px, with 12px gaps when the stack expands.
- Light/dark loading + saved stacks were captured before and after; stable-id
  updates, keyboard dismissal and loading completion were checked again.
  Dark-mode axe reported zero violations and zero incomplete checks.

The existing Toast verify group now holds the actual before/after stack
captures and refreshed interaction recording. The visual verdict is pending.
