# Checks

System-level failures seen across real projects. adeck:interface-craft `references/signs.md` covers screen-level signs (contrast, gradients, type, copy); this list adds what goes wrong when a whole system is built. Read both before handing over a round. Write findings as `location — sign — fix`.

## Controls

- Heavy borders, oversized buttons, or several control heights in one row → one control height per density, hairline borders.
- A button label that wraps → one row right-aligned, then one row of equal widths, then stacked.
- An icon as heavy as its label → icon one step smaller and one step weaker in color than the label.

## Tokens and theming

- A parent rule hard-codes a child's color or size → color sits on the element that owns it; children inherit.
- A floating surface (menu, modal, popover) has no visible edge in dark → an elevated surface token, one step above the page.
- A token referenced through another resolves to its light value in dark (white text on white) → render every board in light and dark.
- A global reset outside the CSS layers wipes component styles (padding 0 everywhere) → put the reset in the lowest layer, or remove it.
- An abstract rule applied mechanically comes out muddy (depth without lines, everything flat) → render it; when it reads as mud, go back to hairlines.

## Structure

- A container inside a container, a card inside a card → remove the outer one.
- The same navigation twice (sidebar categories and tabs with the same items) → keep one.
- A header so large it pushes the content down → shrink it to what it labels.
- Decorative material (glass, blur) on dense controls inside content → material belongs to the floating functional layer only.

## Content

- A field the data does not have (a title, an author, a count) → only fields the product's data has.
- Copy that reads as generated: section numbers, kickers, "everything here is clickable" badges, filler footnotes, stacked metaphors → remove; say what it is.

## Gallery

- The gallery looks like an admin dashboard, or is drawn without the product's own components → product slices built from the kit, real copy, both themes.
