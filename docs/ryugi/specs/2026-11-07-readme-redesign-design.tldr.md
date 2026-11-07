# TL;DR: README redesign

**What gets built:** a README that opens on one 20 s looping clip of the
core loop, then one readable close-up per artifact type, all from the
same demo scenario. Recorded fresh with the launch-video kit.

## What you'll see

1. Tagline: "Your coding agent draws its options instead of describing them."
2. Hero (animated WebP, autoplays on GitHub): you ask → it draws 3 options
   → you pick → it builds → you press Pass. 20 s, loops.
3. Two short paragraphs: the problem, the answer. Then install.
4. Six sections, each "Use it when…" + one close-up still (light/dark):
   Artboard, Document, **Whiteboard (new)**, HTML, Verify, Library.
5. "The skills behind it", harnesses, credits, license.

## Decisions

| Decision     | Choice                                  | By  |
| ------------ | --------------------------------------- | --- |
| Lead with    | artifacts; skills near the end          | you |
| Media        | all may change; animated allowed        | you |
| Launch video | not reused; its kit is                  | you |
| Hero format  | animated WebP, 1600×900, 15 fps, ≤ 5 MB | me  |
| Hero story   | one artboard loop: draw → pick → pass   | me  |
| Stills       | cropped close-ups, ≤ 1100 CSS px wide   | me  |
| Whiteboard   | gets a section                          | me  |
| Scenario     | notification settings (`notify-demo`)   | me  |

## Check these (my calls)

- Hero is light only; stills are light + dark.
- Captions in the hero: 3, at most 4 words each.
- No terminal in the stills; the hero is the only place it appears.
- Nothing is committed until you pass it on `artboard/readme-redesign`.

**Time:** 3–4 h after approval. 45 min to stage, 1.5 h hero, 1 h stills,
30 min README and review page.
