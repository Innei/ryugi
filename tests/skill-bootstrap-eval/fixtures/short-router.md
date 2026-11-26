---
name: using-adeck
description: Use when choosing a Ryugi workflow for a task.
---

# Ryugi workflows

Load the matching skill for the task's current stage:

- New features or behavior changes: `adeck:brainstorming` before implementation.
- Approved designs ready to implement or resume: `adeck:executing-specs`.
- Bugs or unexpected behavior: `adeck:systematic-debugging` before fixing.
- Implementation: `adeck:test-driven-development`.
- Work built or a bug fixed: `adeck:verifying` before reporting completion.
- Visual comparisons, mockups or shared design documents: `adeck:artifacts`.

When your human partner says to skip discussion and code, proceed under TDD.
Ordinary questions and read-only checks can be answered directly.
Use project-specific skills at their relevant step and honor your human
partner's explicit instructions.

Before claiming a fix, passing checks or completion, run the relevant
verification in this session and report what it showed.
