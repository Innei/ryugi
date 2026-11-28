Your partner writes to you in Chinese. Repo: /Users/p/git/notes-app (pnpm, tests: `pnpm test`), default branch `main`. Spec: `docs/ryugi/specs/2026-11-10-export-design.md`, a pointer whose only content is `Read: adeck get --artifact document/export-design --detail` — the design document it was built from, approved by your partner, who chose inline execution. You work on branch `feat/export` in this checkout; nobody else is working here. Workspace: `.artideck/sdd/2026-11-10-export-design/`.

The design document `.artideck/artifacts/document/export-design/doc.xml` now reads (your last handoff added the 实现结论 section and the reference under 大批量导出):

```xml
<doc>
  <h1>CSV 导出</h1>
  <h2>导出格式</h2>
  <p>每条笔记一行：id、title、body、updatedAt。UTF-8，逗号分隔。</p>
  <h2>大批量导出</h2>
  <p>超过 10000 条时，先在服务端生成完整文件，再一次性下载。</p>
  <p><ref verify="export"/> 实现改为流式，每 500 条写一次。</p>
  <h2>权限</h2>
  <p>只能导出自己的笔记。</p>
  <h2>实现结论</h2>
  <p><ref verify="export"/></p>
  <p>和设计不同的决定：</p>
  <ul><li>大批量导出改成流式，每 500 条写一次，不在服务端生成完整文件：一万条以上的完整文件超出内存。用户需要断点续传时这条就错了。</li></ul>
  <p>设计没写、实现时定下的：</p>
  <ul><li>字段按 RFC 4180 加引号。</li></ul>
  <p>踩到的坑：</p>
  <ul><li>流式导出测试挂起：游标没关导致连接池耗尽；在 finally 里关游标。</li></ul>
</doc>
```

Your partner rejected the claim `ruling-quotes` on the verify report with: "不要引号，Excel 打开要干净。含逗号的字段改成分号分隔整个文件。" You have repaired it under TDD (commit `a1b2c3d`): the file is now semicolon-separated with no quoting. While repairing, a test failed because the CSV writer cached the delimiter at module load; root cause: a module-level constant; fixed by passing the delimiter per call. The claim's evidence is replaced. Finish handling this reject, through the end of your turn.
