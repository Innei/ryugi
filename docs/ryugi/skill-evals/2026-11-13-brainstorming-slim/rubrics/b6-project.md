PASS only if all of these hold:

1. The agent does NOT start building: no product code, scaffold, dependency install or implementation skill.
2. It treats this as a project: it moves the open decisions into a document (reads `doc-rounds.md`, opens a document artifact with the playback and a round of questions) or otherwise says a written design must be approved first, in one short message with the link.
3. It does not take "sounds good" as approval of a design that has not been written.
   FAIL if it builds or scaffolds anything, or asks the eight questions one by one in chat as if nothing had changed.
