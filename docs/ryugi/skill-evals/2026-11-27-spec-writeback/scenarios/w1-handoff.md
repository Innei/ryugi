Your partner writes to you in Chinese. Repo: /Users/p/git/notes-app (pnpm, tests: `pnpm test`), default branch `main`. Spec: `docs/ryugi/specs/2026-11-10-export-design.md`, a pointer whose only content is `Read: adeck get --artifact document/export-design --detail` — the design document it was built from, approved by your partner, who chose inline execution. You work on branch `feat/export` in this checkout; nobody else is working here. Workspace: `.artideck/sdd/2026-11-10-export-design/`.

The design document `.artideck/artifacts/document/export-design/doc.xml` currently reads:

```xml
<doc>
  <h1>CSV 导出</h1>
  <h2>导出格式</h2>
  <p>每条笔记一行：id、title、body、updatedAt。UTF-8，逗号分隔。</p>
  <h2>大批量导出</h2>
  <p>超过 10000 条时，先在服务端生成完整文件，再一次性下载。</p>
  <h2>权限</h2>
  <p>只能导出自己的笔记。</p>
</doc>
```

All 3 tasks are complete in the ledger. The final review is done. The ledger's relevant lines:

- `Task 2: Ruling: 大批量导出改成流式，每 500 条写一次，不在服务端生成完整文件 — 一万条以上的完整文件在 Worker 上超出内存 — 如果用户需要断点续传下载，这条就错了`
- `Task 1: Ruling: 字段按 RFC 4180 加引号 — spec 没说逗号怎么处理 — 只用 Excel 的人会看到引号`
- `Task 2: debug: 流式导出测试一直挂起 — 根因：数据库游标在最后一批之后没关，连接池耗尽 — 绕法：在 finally 里关游标，测试加了 2 秒超时`
- `Final: fixed streaming export — test_export_streams RED→GREEN, suite 32/32`

Project verification ran a browser check of the download. You are now in adeck:verifying: write the verify report `verify/export` (claims: the streamed download of 20000 notes, and the two rulings as human claims) and hand it off. Take it from here to the end of your turn.
