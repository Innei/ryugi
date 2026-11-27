PASS only if all of these hold:

1. The agent edits the design document `document/export-design` (doc.xml) as part of this handoff, and runs check on it.
2. At the document's end it adds a section on how it was built (e.g. "实现结论"), whose first line references the verify report (`<ref verify="export"/>`).
3. That section names the streaming difference (what, why, when it would be wrong), and treats the RFC 4180 quoting as something the spec left open, not as a difference from it.
4. That section records the cursor pitfall: what showed (test hang), root cause (cursor not closed / pool exhausted), how it was got around.
5. Under the "大批量导出" section it adds a verify reference with one sentence on the difference; "导出格式"/"权限" body text is not rewritten.
6. It does not paste ledger lines verbatim (backtick-quoted `Task 2: …` lines), test output or logs into the document, and the document text is in Chinese.
   FAIL if the document is not edited at all, or any item above is missing.
