# Skill eval: document tags and live blocks

Date: 2026-10-20
Change: `skills/artifacts/document.md` gains check lists, inline math, footnotes, `<details>`, image attributes, alert types, and a "Live blocks" section for `<dynamic>`.
Spec: `docs/ryugi/specs/2026-10-20-document-tags-design.md`
Method: `writing-skills` subagent scenario, Sonnet, one run each. Skill files copied to a scratch directory; baseline = `SKILL.md`, `document.md`, `html.md`, `ui.md` at `main` before the change, with = after. The agent read only those files and wrote `doc.xml` (and assets) to a directory. Outputs were checked with `parseDocument` and the "with" output was opened in the viewer.

## Scenario: a spec that needs every new construct

Prompt: 把重试退避的方案写成 document：实现清单（两项已完成、一项未完成），行内公式 delay = base · 2^n，jitter 结论加脚注引用 AWS 文章，备选方案折叠，再放一个能拖动 base 和倍数、实时看前 6 次重试延迟的调参块。

| Part | Baseline | With change |
|---|---|---|
| Checklist | `<ul>` with `[已完成]` text markers | `<ul type="check">` with `checked` |
| Inline formula | `<i>`/`<sup>` text, plus a block `<math>` | inline `<math>` |
| Footnote | `<sup>[1]</sup>` and a reference `<ol>` | `<footnote ref>` + `<footnote-section>` |
| Collapsed alternative | `<alert>` saying collapse isn't supported | `<details summary>` |
| Live tuning block | not possible; static table + line chart, offers a separate html artifact | `<dynamic url="assets/backoff.html">` with props; the page uses two `ryugi-slider-input` and listens for `ryugi-props` |
| `parseDocument` | ok | ok |
| In the viewer | n/a | renders; check list, inline math, footnote, details, and the tuning panel all work; `warnings.json` empty, `ran: true` |

Baseline found no way to express any of the five parts. With the change all five use the intended construct on the first run.
