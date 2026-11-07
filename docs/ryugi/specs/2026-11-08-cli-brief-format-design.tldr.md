# CLI Brief 重做 · TL;DR

完整设计：`document/cli-brief-format`（https://ryugi.innei.dev/a/n9GnWcAnqmXLgMqSZzOUS）。批准后保存为 `2026-11-08-cli-brief-format-design.md`。

## 要做什么

所有 `ryugi-artifacts` 命令的 brief 输出都按同一套写法重写。monitor 的提交通知只用来叫醒 agent，不再展开内容。

## 改完你会看到

1. `comment list` 默认只列要处理的，比如 `Asks · 5 to apply (7 settled)`，一页就能读完。
2. 记录行用 id 开头的紧凑写法：`artboard-home · submitted → brainstorming (recommended)`。
3. brief 里不再出现 JSON、`text=none`、ISO 时间和 `data.x` 路径。
4. 后续命令走 launcher；asks 末尾多一行 `Next:`。
5. monitor 的通知变成：`Ryugi answers document/x submitted (5 questions)… Run: …`。

## 决定

| 项                              | 结果                         | 谁定的   |
| ------------------------------- | ---------------------------- | -------- |
| 范围                            | 渲染器加所有命令的视图       | 你       |
| monitor 的 answers/choices 通知 | 不展开内容                   | 你       |
| 默认过滤                        | 只列要处理的                 | 采纳推荐 |
| 头行                            | 写要处理几条，分页单独一行   | 采纳推荐 |
| 记录行                          | 紧凑行，不打印空值和默认值   | 采纳推荐 |
| 线程                            | 只带位置，不显示内部字段     | 采纳推荐 |
| 命令行                          | 走 launcher，末尾加 Next     | 采纳推荐 |
| 状态词                          | 成功写结果，非 0 用固定词    | 采纳推荐 |
| 时间                            | 本地短格式                   | 采纳推荐 |
| 截断                            | 写计数加命令                 | 采纳推荐 |
| 报错                            | 命令名加 Next                | 采纳推荐 |
| JSON 防线                       | 视图自己展开，用快照测试锁住 | 采纳推荐 |
| 验证                            | Haiku 前后对比 3 个场景      | 采纳推荐 |

## 请检查这些（我的决定）

1. `--all` 的含义不变（全部、历史、没有 receipt），不新增 flag。
2. `--format json` 也按同样的默认过滤，结构不变，summary 仍然计全部。
3. resolved 线程只有在有未读的人类消息时才列出来。
4. groups 默认只列：submitted round 里的 choose group，加上被 reject 的 verify group。
5. `--fields` 和 `--format table` 继续可用，同样遵守新规则。
6. 评论通知继续内联正文，旧插件读新 CLI 时靠单词不变来兼容，不升协议。

## 时间

- CLI 渲染器和所有视图，加上快照测试：大约 1 天。
- monitor 和测试：大约 30 分钟。
- skill 文档：大约 1 小时。
- Haiku 前后对比：大约 1 小时。
- 合计大约 1.5 天，不算 npm 发布。
