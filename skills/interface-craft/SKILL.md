---
name: interface-craft
description: Use when a visible product interface needs design judgment, including UI mockups during brainstorming, visual direction exploration, reviewing an existing screen, or refining a prototype that feels generic or inconsistent.
---

# Interface Craft

A design technique, not a mandatory extra phase. Derive design choices from the product, not a house style. Apply it before the first relevant mockup **or** while reviewing/refining an existing interface.

**Integration:** Project design system and explicit decisions take priority. Ryugi:brainstorming owns requirements and approval; ryugi:artifacts owns visual presentation; ryugi:verifying-ui owns the human verdict for built UI. This skill adds **no new approval gate**.

## Choose the task

- **Create / explore:** Establish or reuse direction *before* producing visual alternatives. Do not invent a new direction when the product already has one.
- **Review / refine:** Inspect the actual rendered result when possible and identify evidenced issues. Read [evaluation](references/evaluation.md) before proposing changes.
- **Precise edit:** When an exact visual change is specified (e.g. one button's color), do it without initiating five questions, a fresh design exploration or unrelated modifications.
- **Not UI:** Do not use this skill for backend work, architecture diagrams, pure copy or generic documents just because they have a visual format.

## The five lenses

Infer from the product, brief, current screen and user decisions. Read [direction](references/direction.md) when deriving a new direction.

1. **Product:** Who uses this interface, for which job, under what conditions?
2. **Character:** Which two or three specific qualities should it communicate? Avoid empty labels such as modern, clean, premium or sleek.
3. **World:** What relevant materials, objects, contexts and metaphors actually belong to this product?
4. **Moments:** Where should attention or visual richness concentrate? One or two intentional moments, if appropriate; not a mandatory hero.
5. **Signature:** What small repeatable detail could be meaningful and distinctive? Omit it if forced.

Translate those answers into decisions about information hierarchy, density, spacing, typography, copy, color, content, motion and states. Read [craft principles](references/craft.md) selectively. No blanket bans on gradients, glass, expressive typography or animation.

## Apply without adding a new process

- **Brainstorming → Artboard:** Derive or reuse direction internally before drawing. Let mockups demonstrate it, not five paragraphs in chat. When direction itself is undecided, make it *one* Artboard question. After a direction is chosen, hold it constant for later comparisons of layout, interactions and states.
- **Next Artboard rounds:** Honor already accepted choices, project tokens and real product content. A group compares one question; avoid changing a whole aesthetic when evaluating one navigation alternative.
- **Written design:** Capture the selected direction and approved board decisions in the written spec, so implementation can preserve them without the original Artboard files.
- **Review:** Distinguish measurable problems from design hypotheses and taste. Provide locations and evidence; if already good, say so and stop. Respect the requested edit scope.
- **Build / verify:** Do not silently reinterpret approved designs. Use ryugi:verifying-ui for the real-app visual comparison and final human verdict.

## Final check

Does each important visual choice serve this product's task? Is the rationale specific rather than fashionable? Does the design respect constraints, accessibility, responsiveness and the accepted brand? Are the alternatives meaningfully different *only in the dimension being compared*? If the answer is no, revisit the appropriate lens instead of polishing everything.

Inspired by [Unslop by Damir Sokolovsky](https://github.com/heydamir/unslop) (CC BY 4.0). This adaptation extends its five-part direction method to design creation and critique.
