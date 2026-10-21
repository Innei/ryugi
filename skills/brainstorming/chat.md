# Brainstorming in chat

One question per message, with playback as you go. Use this path until the
work outgrows it; then step up to the document (below).

## Your First Message

Your first message is one open question that gets them describing. Ask
about a real moment or a concrete picture: "What's the moment you find
yourself wishing this existed?" or "Tell me about the people who'll be in
the room."

That's the whole message: one sentence, one question mark. A follow-up
question waits for their answer.

## Each Message

Each message ends with one question: a single sentence with no list of
example answers hanging off it. Use plain language, pitched just a little
above where your human partner is. Match their vocabulary; never use
process jargon.

## Play It Back

Play back as you go. As soon as you understand one part well enough to
describe it (what it's for and who it serves, say, or how one piece
behaves), describe that part back in about 200-300 words, then return to
questions about the next part. Playback and questions alternate through
the whole conversation; the last chunk covers whatever is left.

Mark anything you're guessing as your guess; only what they said goes in
as theirs. End each chunk by asking what's wrong or missing.

Before you send a chunk, check it: does it describe something they'll
look at, like a page, a screen, a schedule, or a printout? If so, open
the mockup as "Designing What They'll See" in SKILL.md says, and send the
chunk with its link.

## Step Up to the Document

Before every playback, check what you now know. Step up when any of these
is true:

- it spans several modules, services or repos that each need decisions of
  their own (one field carried from the screen to the database is one
  change, not several)
- it changes the architecture: how parts talk to each other, where data
  lives, how it deploys
- more than five decisions are still open
- one open answer decides whether other questions exist at all

When one is true, the playback goes into a document instead of chat:
follow `doc-rounds.md`, starting at "Coming From Chat". Open it without
asking first. Your message is one line on why the conversation moved,
plus the link.
