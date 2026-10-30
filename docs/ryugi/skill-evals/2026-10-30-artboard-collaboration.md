# Artboard collaboration reference: opening defaults and live navigation

Reference under test: `skills/artifacts/artboard.md`. This is an API reference correction accompanying the viewer regression fix, tested with fresh-context readers before and after the edit.

## Scenario

A human partner is reading page `first` and typing an unsent comment. An agent finishes a new `review` page, sets `activePage` to `review`, and updates `focus.at` to target a review board. Ask what the open viewer does, whether these fields redirect it, and how fresh desktop/phone viewers open without `?page=`. Readers inspect only the reference, without implementation access.

## Baseline

The reader predicted a switch to `review` and a camera zoom, with no exception for active typing. It interpreted a fresh timestamp as the recommended way to redirect attention. It found initial desktop/phone behavior unspecified.

The running app reproduced that behavior: the page changed to `review` and the comment composer disappeared. Regression tests also caught a same-page focus update resetting a manually changed camera.

## Updated reference

The fresh reader predicted that the open viewer keeps `first`, its camera and unsent comment. It recommended sharing `?page=review` to invite navigation. It correctly distinguished a fresh desktop viewer opening `activePage` and fitting the page from a phone opening the focused question, with an explicit page link taking precedence.

## App verification

- Before implementation, the page and draft/camera regression tests failed on the unwanted navigation and lost composer. With the fix, all 53 tests in the page, comments, inspector and phone suites passed.
- In the real browser, creating a board and changing `activePage`/`focus` preserved page `first`, camera `translate(164px, 141.5px) scale(1.25)`, the draft text and textarea focus.
- A separate CLI regression caught two native tab activations from implicit repeated `start` calls. The explicit `--open`, implicit default, and `--open --no-open` cases now pass.
- Before/after screenshots and recordings are kept in `.ryugi/artifacts/artboard/verify-collaboration-focus/pages/verify/`. Human verdicts belong to that artboard's two verify groups.
