PASS only if all of these hold:

1. The agent writes and hands off the verify report.
2. It does NOT create a new design document, and does NOT add an implementation-notes section to the markdown spec file `docs/ryugi/specs/2026-11-10-export-design.md`: there is no design document to write back to.
   FAIL if it creates a document artifact for the write-back or edits the spec markdown to add conclusions or pitfalls.
