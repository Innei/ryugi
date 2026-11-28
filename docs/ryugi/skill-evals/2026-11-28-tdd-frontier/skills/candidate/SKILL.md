---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code
---

# Test-Driven Development

Tests are for code that can be wrong in ways reading it won't show. Decide
for each change whether it needs one. Simple changes are written directly
and checked by running them; the rest get a test that has been seen to fail.

**Before the first edit:** adeck:using-git-worktrees decides where the
work happens, unless adeck:executing-specs already did at its Setup.

## Decide first

**A bug fix always starts with a test that reproduces it**, however small
or obvious the fix: it broke, so it was not obvious. The test fails on the
current code for the reported reason before you change that code. A deadline
does not change this; the repro is how you know the fix worked.

**Otherwise, write it directly** when the whole behavior is visible in the
diff and a reader would call it right at a glance: copy, styling, config
values, renames, wiring that passes data through, or changing which input
goes into logic that is already tested (a sort key, a flag, an argument).
Don't add a test for it — a test that asserts a string or a constant equals
its new value catches nothing. Update existing tests that pin the old value.

**Test it** when a wrong answer would look plausible:

- **Logic:** branches, boundaries, calculations, parsing, state transitions,
  ordering, concurrency.
- **A contract** other code or other people rely on.
- **A refactor** of logic: what it must preserve is covered before you
  start; add what is missing first.

Unsure? Ask whether a reviewer reading the diff would see it if it were
wrong. If they would, write it directly; if it could look right and still be
wrong, test it.

## A test is proven red

A test only ever seen passing proves nothing. For each behavior you test,
either:

- **Test first:** write it, run it, and see it fail because the behavior is
  missing — an assertion failure or the missing export, not a typo or a
  broken fixture. Then write the code. Bug fixes always go this way.
- **Test after:** the code exists, so break the behavior on purpose (revert
  the change, invert the branch, return the default), run the test and see
  it fail, then restore the code and see it pass.

A test that passes before the behavior exists is a finding: either it does
not test what its name says, or the behavior already exists. Find out which
before you write production code.

## Run what the change can reach

Every change, tested or written directly, is checked by running something:
the tests that exercise the code you touched (the files that import it, its
callers' tests, the end-to-end tests that load it), and the typecheck or
build when there is one. Search for them; a scope statement in your task
bounds the deliverable, not your verification. The full suite runs once,
when the branch lands (adeck:executing-specs `landing.md`).

Your report says, per behavior, what proves it: the test and how it was
proven red, or what you ran for a change written directly. Any failure a
run shows — including one you didn't cause — goes in your report by name; a
red test you watched scroll past and didn't mention is a report falsified by
omission.

## Writing the tests

Before writing or changing a test, a mock or a test helper, read
[writing-good-tests.md](writing-good-tests.md).
