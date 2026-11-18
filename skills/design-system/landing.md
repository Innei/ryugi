# The Landing Section of the Spec

The spec carries everything the builder needs to land the system without the artboard. Add these sections to the written design.

## Token table

One row per token, grouped (surface, text, border, accent, semantic, type, space, radius, depth, motion):

| Token | Light | Dark | Use | Board |
| ----- | ----- | ---- | --- | ----- |

The code token source is the only source: CSS variables, a theme module, an asset catalog, whatever the platform and the project already use. Name the file it lives in.

## Layout rules

One row per page type (list, detail, form, settings, empty state…): navigation, header height and contents, content width, padding, density, and what changes from narrow to wide, with the layout-sheet board id. Name the layout components that carry it (app shell, page header, section).

## DESIGN.md

At the repository root, unless the project already keeps a design doc or a design skill, in which case that file is updated instead. Outline it in the spec:

1. Five direction lines
2. Token table (or a pointer to the token source plus the use column)
3. Type, spacing and radius rules; layout rules per page type
4. Each component: when to use which variant, what it never does
5. "Don't" examples
6. Pre-ship checklist

Agents read it before drawing the next mockup, so write rules, not history.

## Tokens page and gallery

- **Tokens page**: reads token values at runtime and lists them in groups, each with its use. It is the first page of the gallery.
- **Gallery**: every component in every state, drawn with the product's own components as real product slices with real copy. It opens without signing in. A project without Storybook does not get one.

## Guard test

A test that fails when a token exists in the source but not on the tokens page. When the project already lints styles, add a rule against raw colors outside the token source.

## Replacement plan

Which screens move to the system, in what order, and which old styles are deleted. Empty for a new product. For screens that existed without tokens, it lists each literal value and the token that replaces it. A verify plan names the boards each built screen is compared against (ryugi:verifying).
