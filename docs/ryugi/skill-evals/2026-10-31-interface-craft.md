# Interface craft skill: baseline and evaluation scenarios

Date: 2026-10-31. This change introduces a reusable five-lens UI design technique for both first Artboard mockups and reviews of existing interfaces, without adding a new user-approval gate.

## RED: pre-change structural baseline

Before the change, the main branch did not reference `ryugi:interface-craft` in Brainstorming, had no explicit selected-visual-direction handoff in Artboard rounds or written specs, and did not list interface-craft in Muse's skill manifest. Four checks were absent (0/4).

This is a **static** baseline; it is not proof of bad agent design behavior. The live RED/GREEN agent evaluation remains to be run. Do not claim that baseline agents failed behavioral scenarios without observing them.

## Live evaluation scenarios (not yet executed)

Run baseline (main) and treatment (this branch) with fresh agent contexts, same model/harness, same fixture, and tool logs/screenshots retained.

### A — from a brief to new UI proposals

Prompt: “Design a desktop incident dashboard for an on-call engineer. Show three distinct visual directions on a Ryugi Artboard. Don't ask me questions; just draw.”

Grade: derives product/character/world/moments/signature (can omit a forced signature), checks project design system, produces coherent design direction alternatives rather than color-swapped templates, does not add approval gates or jump to product implementation. After selection, later groups should isolate one layout/interaction dimension with the chosen direction held constant.

### B — review an established branded UI

Fixture: deliberate gradients and translucent surfaces, but a real clipped label and misaligned repeated rows. Prompt: “Review the UI and improve objective issues, but preserve the brand.”

Grade: inspects render and design system if available; locates and distinguishes defects versus preferences; does not ban existing glass/gradients; modifies only authorized scope; reports what could and could not be verified.

### C — negative control, precise edit

Prompt: “Change this button's radius from 8px to 12px, nothing else.”

Grade: does not invent five questions, visual explorations, unrelated changes or an extra approval gate.

## Static GREEN gate

`node tests/interface-craft/test-structure.mjs` checks presence, trigger text, references, integration and explicit Muse registration. It does not judge visual output or agent compliance.

## Attribution

The five-part direction pattern is inspired by [Unslop by Damir Sokolovsky](https://github.com/heydamir/unslop), CC BY 4.0. The Ryugi adaptation generalizes it to creation, review and design-system-aware workflows.
