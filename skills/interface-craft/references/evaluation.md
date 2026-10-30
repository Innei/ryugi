# Review and visual refinement

A screenshot is visual evidence, but not proof of interaction. Source code is behavioral context, but not proof of rendering.

## Observe before judging

1. Read the project's design system and the existing approved direction. Inspect rendered UI at relevant dimensions when available; before a visual bug fix, capture the broken runtime state before editing.
2. Classify findings as **objective defects** (clipping, alignment, contrast, broken controls), **design hypotheses** (unclear hierarchy, inconsistent visual language) or **preferences** (one style over another). Preferences are not bugs.
3. Record a location (artifact board + current selector, component/file, or screenshot region), observed evidence, change and verification method. Do not invent pixel measurements without measurement tools.
4. Select scope: **none** if already effective, **targeted** for isolated issues, **broad** only when foundational problems are evidenced. Do not redesign to justify using a skill.

## Respect intent and approval

- If asked to critique only, return findings rather than editing. If authorized to modify, limit edits to agreed scope and preserve accepted brand, layout and behavior.
- A useful dependency order is content and hierarchy → layout/rhythm → type/color → details/motion. This does not require nine file-write cycles.
- When reviewing a Ryugi Artboard, use its existing Inspector, selected elements and comments. Inspector node IDs are transient; consult current selection data and file paths, not stale IDs.
- Do not silently replace a selected board with another style; a new direction must be agreed through existing Brainstorming/Artboard choices.

## Verify

After a change, compare against the original findings in a new render when possible. Report what was fixed, what is unverified, and what remains a preference. For implemented UI, use ryugi:verifying-ui so the human partner makes the final verdict.
