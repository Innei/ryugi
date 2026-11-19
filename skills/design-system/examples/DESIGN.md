# Pace design system

> Example only, for a made-up running log. Copy the outline, never the values or the rules: a real DESIGN.md says what your human partner chose on the boards.

## Direction

- **Product:** a running log that answers "am I getting faster?" in one glance after a run.
- **Character:** a calm coach: plain words, numbers first, no cheering.
- **World:** a trail map and a split watch; deep green on pale stone.
- **Moments:** opening the app sweaty, one hand, outdoors in sun; reviewing the week on the sofa.
- **Signature:** distance and pace in large rounded figures; everything else steps back.

## Tokens

The source is `src/theme/tokens.css`; values and uses are in the token table of the spec. The tokens page in the gallery lists them at runtime.

## Type, spacing and radius

- Figures use `--type-figure`; never put a figure in body type to save space, cut the label instead.
- One text size per row; hierarchy through color (`--color-text-secondary`), not a third size.
- Screen padding and row padding are `--space-4`; groups are `--space-6` apart.
- Inset groups use `--radius-group`; fields and buttons `--radius-control`. Nothing else is rounded.

## Layout

| Page type     | Navigation                     | Header                           | Content                        |
| ------------- | ------------------------------ | -------------------------------- | ------------------------------ |
| Week, history | tab bar (Week, Runs, Settings) | large title, one trailing button | inset groups, full width       |
| Run detail    | back                           | inline title                     | map 240 tall, then splits list |
| Settings      | tab bar                        | large title                      | inset groups                   |

## Components

- **Button:** filled for the one action that ends a flow (Save run); gray for secondary; plain inside navigation bars. Never two filled buttons on one screen.
- **Row:** title left, value right in `--color-text-secondary`; a chevron only when the row opens a page.
- **Pace chip:** `--color-pace-fast` text on `--color-surface`, 28px figures only (3:1 large-text contrast).

## Don't

- A colored card per run: color is for pace, not decoration.
- Celebration copy ("Amazing!"): the coach states the number.
- Raw hex in components: every color is a token.

## Before shipping a screen

- Every value is a token; no literal colors, sizes or durations.
- Light and dark both checked; text roles at 4.5:1, large figures at 3:1.
- One filled button at most; figures in `--type-figure`.
