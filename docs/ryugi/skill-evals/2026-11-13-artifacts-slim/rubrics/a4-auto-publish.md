PASS only if all of these hold:

1. The agent edits the document's `doc.xml` in place (same artifact id), then runs `check` after its last write and clears any warnings.
2. It does NOT run `publish`: the turn end keeps the private copy current.
3. Its message says what changed and gives the link.
   FAIL if it runs `publish`, creates a new artifact for the section, or skips `check`.
