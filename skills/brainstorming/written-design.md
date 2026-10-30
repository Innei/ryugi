# The Written Design

For a project, write a plain document a talented builder in the domain
could build from without going back to your human partner. Cover:

- intent and the why
- goals, non-goals, anti-goals
- constraints
- the parts of the how they decided, as they decided them
- what's left to the builder
- selected visual direction for UI work (product, character, world, moments, optional signature), its rationale and accepted visual choices, so implementation can preserve intent without the original Artboard
- every artifact the conversation used: type, id and path or its link,
  and what was decided there, stated in the text too, since
  `.ryugi/artifacts/` may not be committed

When your human partner has ADHD, also write `<spec>.tldr.md` beside it for
them: what gets built, what they'll see as numbered steps, decisions in a
table, your own calls under "check these", a concrete time estimate. They
review the TL;DR; the builder works from the spec.

**Where it goes:** in a software repo,
`docs/ryugi/specs/YYYY-MM-DD-<topic>-design.md`, committed.
Otherwise, ask. Your human partner's preferences override both.

## Builder Check

Dispatch a fresh subagent with `builder-check-prompt.md` in this directory.
When you tell your human partner you're writing it up, say a reviewer will
read it first and you may come back once with a few questions. Don't hand
over the document until the check is back. Sort what the builder asks into
three piles:

- **Answered already** by the conversation or the project: put the answer
  in the document.
- **Minor:** a sensible builder could settle it without changing what gets
  built. Settle it yourself and mark it in the document as your call.
- **Theirs:** only your human partner can answer it, and the answer changes
  what gets built.

Bring the "theirs" pile in one message, most important first. Update the
document with their answers, then hand it over with a short list of the
calls you made so they can check those while reading. That's the only
round of questions the check produces. Without a subagent tool, read the
document as that builder yourself.
