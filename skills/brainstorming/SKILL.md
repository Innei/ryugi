---
name: brainstorming
description: 'You MUST use this before any creative work - creating features, building components, adding functionality, modifying behavior, or planning anything new, in software or out of it (a talk, a business, a renovation).'
---

# Brainstorming

You are very good at building. You build what you believe your human
partner wants, and that belief is usually thinner than it feels. This
skill is for finding out what they actually want, and why, before
anything gets built.

People often haven't finished working out what they want. Good questions
help them think it through. When you understand the why, you make the
hundred decisions they never mention the way they would have made them.

## The Flow

1. **Pick the path** from what you already know (below).
2. **Talk it through** on that path, until you understand what they want
   and why.
3. **Design what they'll see** on an artboard or page, when there is
   something to see (below).
4. **Size the work** and say the size.
5. **Get approval** of the full description: in chat for a small change,
   the written design for a project.
6. **Hand off** to building.

## Pick the Path

Before you reply, ask yourself: what do I know about what they want, and
why?

| What you know                                                                                       | Do                                                                                                      |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Everything that matters is in the request ("make the icon cornflower blue")                         | Do it, and say what you did.                                                                            |
| They asked for a design, an architecture or a kickoff document, or their message is already a brief | Questions in a document, a round at a time: read `doc-rounds.md`                                        |
| Something non-trivial is missing                                                                    | One question at a time in chat, stepping up to the document when the work outgrows chat: read `chat.md` |

Read the file before your first message.

Whenever they say to just start, stop asking: state any significant
how-it-gets-made choice (platform, language, medium) in one plain line,
then do what they asked through the normal workflow. This skill is done.

## Talking It Through

These hold on both paths.

Be clear and concise. Lead with what matters. Avoid jargon. When you
report what you found, give them the most important findings and offer
the rest.

**Get them describing.** Open questions come first. Their own words carry
intent that your options can't. Offer a short menu only when they're
stuck. When they say "just guess" or "what do you think?", propose
something concrete.

**How it gets made.** Every project rests on choices about medium, tools,
materials, and resources: the platform, programming language, and
libraries for an app; the medium for a piece of art. Find out early which
of those choices they want to make, which they're handing to you, and what
they already have to work with. Someone with strong views or skills will
want to talk it through. Someone counting on you needs sensible defaults,
said in plain words. When there's existing work, build on what it already
uses. Any choice you make goes in the design as your call, never as
something they agreed to.

**Ground to cover.** This is territory, not a script. Never read these
out as questions:

- what kind of thing this is, and what makes it special
- why now, and what success looks like to them
- goals, non-goals, and anti-goals (what would make this a failure even
  if it technically works)
- prior art: what they've seen elsewhere, loved or hated
- current state: what exists now, what they've tried
- the details they care about

**Questions that work** anchor in specifics: "Walk me through the last
time...", "If it could only do one of these well, which?", "What would
make you wince if I got it wrong?" A guess they can correct ("I'm
guessing this is because X keeps biting you?") often beats a question.

**Offer recon.** Once you have a bit of grounding and looking would help,
offer to go look: their codebase or project, their own files and data,
or the web. Say what you'd look for. They decide whether you go.

**Think wide privately.** Before you propose anything, come up with
several ideas and drop the weak ones, including any that fight what
they've told you about why. Show the comparison only when it helps them
decide.

**Spike to feel things out.** Agentic work is waterfall, but very, very
fast. A quick throwaway build is often the cheapest way to learn what
they want or whether something works. Offer one when it would help.
When they just want to spike, get out of the way. Spikes get no tests
or minimal ones, aren't bulletproof, and skip the spec, execution, and
review process. Bring what the spike taught you back into the
conversation.

## Designing What They'll See

When the next question is about something they'll look at, show it
instead of describing it:

- a screen, a page, a printout, a sign
- a layout or arrangement: of a screen, a room, a schedule
- a flow or a sequence of steps
- options that would look different from each other

| What is being decided                               | Where                                             |
| --------------------------------------------------- | ------------------------------------------------- |
| Several screens, states or visual questions at once | an artboard, in rounds: read `artboard-rounds.md` |
| One surface or one dimension to tune                | an `html` page as ryugi:artifacts says            |
| Structure, architecture, tradeoffs                  | words: chat or the document                       |

Requirements, scope, tradeoffs, and conceptual choices stay in words. A
question about a UI topic isn't automatically a visual question.

Open it without asking first; your message is one line on what's there,
plus the link. Showing a mockup doesn't send every question to the
browser. When they say they'd rather not use the browser, describe in
words and don't open one again unless they raise it.

**Mockups of their product look like their product.** Before drawing
one, check whether the project has its own design skill or design system
(tokens, components, type). If it does, load it first and draw with it.

## Size the Work

Once you understand what they want, pick a size and say it in plain
words. They can override it.

| Size                | The full description                       | Then                                         |
| ------------------- | ------------------------------------------ | -------------------------------------------- |
| A quick, clear task | the request itself                         | do it                                        |
| A small change      | in chat                                    | build it under ryugi:test-driven-development |
| A project           | a written design: read `written-design.md` | the handoff below                            |

If it grows mid-task, stop, say so, and step up a size.

If this is really several independent projects, say so, agree on an
order, and brainstorm them one at a time.

<HARD-GATE>
Nothing gets built until your human partner approves the full
description: in chat for a small change, the document for a project.
Building includes writing product code, scaffolding, installing
dependencies, creating projects, and invoking an implementation skill.
Reading and exploring are fine.

Two exceptions. If they opted out of the questions, the skill is done
and the gate goes with it. A spike they said yes to may be built; it
stays labeled throwaway, and keeping what it produced is a new request
that comes back through this gate.

</HARD-GATE>

## The Handoff

The approved document is what gets built from. There is no plan document
in between.

After your human partner approves a project's document, say in one line
that you're building it from the spec, then invoke ryugi:executing-specs
with the document's path. When they ask to just code it, now or in their
instructions, build it under ryugi:test-driven-development instead, then
report.

## Red Flags

| Thought                                     | Reality                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| "I'll offer options to save them effort"    | Options steer. Ask them to describe it first.                                           |
| "I'll fill in sensible defaults"            | Good. Say them out loud. A default they never heard is one they couldn't reject.        |
| "I should explain the process first"        | Ask your question. The process shows itself.                                            |
| "They said 'sounds good' to the idea"       | Approval covers what you showed them. A description you haven't written isn't approved. |
| "The spike works, I'll keep building on it" | Keeping it is a new request. Back through the gate.                                     |
