# CLI Brief 输出格式重做：设计

2026-11-08 批准。讨论记录：`document/cli-brief-format`（https://ryugi.innei.dev/a/n9GnWcAnqmXLgMqSZzOUS）。TL;DR：`2026-11-08-cli-brief-format-design.tldr.md`。

这份设计重写 `ryugi-artifacts` 的 brief 文本输出，同时精简 monitor 的提交通知。代码在两个仓库：CLI 在 `ryugi-cloud/packages/artifacts`（发布到 npm），monitor 和 skill 文档在 `ryugi`。

## 1. 为什么做

brief 的主要读者是 agent。目标是 agent 读一次输出就知道下一步做什么；现在它要额外 grep、翻页，还要猜字段的意思。

一个真实的例子：一次回答提交后，agent 先跑了 `grep -v "state=settled"`，又跟了一条 `More`，才读到最后 2 条 submitted，因为第 1 页有 7 个位置被已 settled 的记录占了。monitor 那边又把答案展开了一遍，结果被 500 字符截断，agent 最后还是得去跑 CLI。

大部分问题出在共用渲染器 `src/cli/output/render.ts` 上，所以每个命令都会遇到：

- null 字段打印成 `none`，false 也照样打印；
- 对象字段直接用 `JSON.stringify` 输出，线程的 anchor 会带出 CSS 路径和 hash；
- 后续命令绕过了 launcher；
- 状态词混用（`COMPLETE`/`STATE`/`PREVIEW`/`READY`/`LISTED`）；
- 时间是 ISO 格式；
- 截断提示是 `Omitted: data.issues (preview)` 这样的 JSON 路径；
- 报错的头行是内部 id（`comment.list: ERROR`），后面没有下一步。

## 2. 目标和非目标

| 目标                                                             | 非目标                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| agent 读一次 brief 就能执行下一步：不用 grep，常见情况下不用翻页 | 改 `--format json` / `jsonl` 的结构                  |
| 所有命令的头行、记录行、分页行、命令行用同一套写法               | 给人做终端里的漂亮排版；人看内容用 viewer            |
| brief 里不再出现 JSON、内部字段和 JSON 路径                      | 升级 `ryugi.cli/v1` 协议，或者改 launcher 的版本协商 |
| monitor 的提交通知只负责叫醒 agent，内容一律从 CLI 读            | 改评论通知的内联正文（`fa75b174` 刚修好）            |

**反目标**：不能为了简短丢掉 agent 下一步要用的东西：id、receipt、snapshot、cursor、错误码、恢复链接。

## 3. 约束

- 插件和 CLI 分开发布。launcher 总是跑最新的 CLI，所以新 CLI 发出去时，用户手上可能还是旧版 skill 文档。旧文档里写的字段名（`byRecommendation`、`waitingOn`、`state`）在新 brief 里换了写法，agent 仍然要读得懂：新 brief 保留同样的单词（`submitted`、`recommended`、`waiting on`），只是不再写成 key=value。
- 用户可以把默认格式配置成 json（`config --output-format`）。打印出来的后续命令执行时必须仍然输出 brief。
- `ryugi` 没有运行时依赖，monitor 的改动只用 Node 内置模块。

## 4. 设计

### 4.1 共用规则（渲染器）

输出从上到下固定是这几部分：

```text
<Thing>: <STATUS> · <subject> · <count summary>     头行
<facts，每行一个 Label: value>
<section 标题行：Asks · 5 to apply (7 settled)>
  <记录行>
<Page 1 of 2 · 10 of 12 · More: <命令>>             只在有分页时出现
Warning: …
Next: <一句话下一步> · <命令>                        每个 section 一行，没有就省略
<Label>: <命令>                                     Read / Acknowledge / Details / More
```

| 规则         | 具体                                                                                                                                                                                                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 状态词       | exit 0 时写命令自己的结果（`RUNNING`、`PUBLISHED`、`CLEAN`、`STOPPED`、`UP TO DATE`）。非 0 统一用固定词：1 `FAILED`、2 `NEEDS YOU`、3 `ISSUES`、4 `INCOMPLETE`、5 `PARTIAL`、130/143 `INTERRUPTED`。删掉 `READY`、`LISTED`、`STATE`、`COMPLETE`、`PREVIEW`、`READ`；读操作成功时不写状态词，直接写计数。 |
| 头行名称     | 用用户看到的命令名，首字母大写，例如 `Comment list`，不用 `comment.list`。                                                                                                                                                                                                                                |
| 空值和默认值 | null、空字符串、false 和视图声明的默认值都不打印。布尔值为 true 时只写它的单词（`recommended`、`stale`）。                                                                                                                                                                                                |
| 对象         | 渲染器遇到对象或数组字段直接抛错，由每个视图自己决定展开哪些字段；快照测试保证没有命令会走到抛错。                                                                                                                                                                                                        |
| 记录行       | id 开头，用 `·` 分隔；位置固定的值不写 key；长度不定的文本（标题、quote）放最后。只有含义不明显的值才写成 `label value`。                                                                                                                                                                                 |
| 时间         | 本地时区：今天写 `14:47`，今年写 `11-07 19:09`，更早写 `2025-11-07`。                                                                                                                                                                                                                                     |
| 截断         | 写成 `2 more issues · Details: <命令>`。记录内的长文本截断时，行尾写 `…`，并在命令行里给出带 `--detail` 的版本。                                                                                                                                                                                          |
| 分页         | `Page 1 of 2 · 10 of 12`；全部显示时写 `all shown`；只有一页时整行省略。                                                                                                                                                                                                                                  |
| 命令行       | 用 `RYUGI_ARTIFACTS_COMMAND` 作前缀（launcher 已经设置，见 `paths.ts` 的 `invocation()`），不再用 `process.execPath + argv[1]`。只有当前生效的配置格式不是 brief 时才带 `--format brief`。保留 `--project-dir`、`--artifact`、snapshot、cursor、receipt。                                                 |
| 报错         | `CODE: message` 写一行；`HTTP:` 只在 5xx 时显示；能恢复的错误跟一行 `Next:`；恢复链接照旧打印。                                                                                                                                                                                                           |

### 4.2 评论相关视图

范围：`comment list`（summary、threads、asks、groups、rounds、`--sections`）、`comment read`、`comment ack` 和各个写操作。

- **默认只列要处理的**：
  - asks：只列 submitted。
  - threads：保持现在的 unread 范围，但去掉没有未读人类消息的 resolved 线程。
  - groups：只列 submitted 状态的 round 里的 choose group，以及 verdict 为 reject 的 verify group。
  - rounds：只列 open 和 submitted。

  其余记录只在 section 标题的括号里计数。过滤放在服务端做，分页计数才对得上。

- **`--all` 的含义不变**：仍然是"全部、历史、没有 receipt"。threads 默认隐藏的线程本来就不需要 ack，所以不会出现"看得到但 ack 不了"；asks、groups、rounds 本来就没有 receipt。不新增 flag。_（我的决定）_
- **JSON 也按同样的默认规则过滤**：结构不变，`summary` 里的计数仍然算全部记录。ryugi 仓库里没有代码解析 `comment list` 的 JSON（hook 直接读文件）。两种格式一起过滤，brief 和 JSON 才不会对不上。_（我的决定）_
- **section 标题**写要处理几条，例如 `Asks · 5 to apply (7 settled)`、`Threads · 2 waiting on you (4 resolved)`、`Groups · 3 picked in round r2 (4 earlier, 2 pending verdict)`。没有要处理的就写 `Asks · nothing to apply (7 settled)`。
- **summary**（不带 section 的 `comment list`）每个集合一行计数，后面跟它的读取命令，不打印 JSON。
- **Next**：
  - asks 写 `Next: apply each answer, then settle it · <comment note 命令，--ask <id>>`；
  - threads 保留 `Read` / `Acknowledge`；
  - groups 的 Next 跟 artboard.md 里的流程一致。

```text
Comment list: document/using-ryugi-rework · 5 to apply
Asks · 5 to apply (7 settled)
  artboard-home · submitted → brainstorming (recommended)
  direction-axis · submitted → by-purpose (recommended)
  codex-method · submitted → manual
  trigger-moment · submitted · "按 router eval 里 todo 的失败作为起因"
  more-cases · submitted · no answer
Next: apply each answer, then settle it · node "/…/ryugi-artifacts.cjs" comment note --project-dir /… --artifact document/using-ryugi-rework --ask <id>

Threads · 1 waiting on you (4 resolved)
  HAnrNaY-40 · open · waiting on agent · block intro "作者名字"
    8XPC1qx1hw Innei 14:47
      这条带头像：没登录时是 Gravatar，取不到就退回首字母。
Acknowledge: node "/…/ryugi-artifacts.cjs" comment ack --project-dir /… --artifact document/comment-demo --receipt 801f…
```

asks 行的写法：

- 有选项时写 `→ value`；
- 写了文字时，文字加引号放在行尾；
- 两者都没有时写 `no answer`；
- stale 和 orphan 的记录只有加 `--all` 才看得到，在行里作为单词出现。

线程位置的写法：

- document：`block <id> "quote"`；
- artboard：`board <id>`，有页面时写 `page <id> board <id>`；
- whiteboard：`element <id>` 或 `page <id> x,y`。

消息行写 `<id> <name> <time>`；作者是 agent 时加 `(agent)`；正文缩进放在下一行。

### 4.3 其他命令

| 命令                         | 现在的问题                                                                   | 改成                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `start` / `stop`             | `Effect:` 一行重复了头行                                                     | 头行写 `Server: RUNNING · reused`；`Open` 和 `Local` 照旧；只有 effect 不是 confirmed 时才打印 `Effect:`。       |
| `publish` / `publish --list` | `ID=` 和 `version=` 大小写混用；ISO 时间；`matched · 10 shown / 249 matched` | 记录行写 `id · type · visibility · vN · time · title`；标题行写 `Cloud artifacts · 249 on account`；分页按 4.1。 |
| `get`                        | outline 行也是 key=value                                                     | 按 4.1 的记录行写；`Details` / `More` 保留 snapshot。                                                            |
| `check`                      | `Static: issues` 重复了头行；`Browser: unknown`；`Omitted: data.issues`      | 头行写 `Check: ISSUES · artboard/x · 3 issues`；Browser 只在影响结论时出现；截断按 4.1。                         |
| `config`                     | Output 是 JSON；`Source: global` 和 JSON 里的 `"source":"default"` 矛盾      | 一项一行，来源写在括号里：`Auto-publish: on (global)`、`Output format: brief (default)`。                        |
| `changes`                    | `UNCHANGED` + `No records.` + `Scope: human_changes · 0 shown`               | 没有改动时一行 `Changes: document/x · no human edits`；有改动时列 block id 和 `Read`。                           |
| `scene` / `update`           | 同样的通用问题                                                               | 按 4.1。                                                                                                         |
| `--version` / `--help`       | `Version: READY` + `Version: 1.63.0`                                         | 一行 `ryugi-artifacts 1.63.0`；help 的头行不写状态。                                                             |

表里没列出的字段，由每个视图逐个判断：agent 下一步用得到就留，用不到就删。

**`--fields` 和 `--format table`**：`--fields` 在 brief 里继续可用，额外选中的字段以 `label value` 的形式加在行尾。table 保留自己的列布局，但同样遵守 4.1 里空值、对象和时间的规则。两者现有的调用方式都不会坏。_（我的决定）_

### 4.4 Monitor（ryugi 仓库）

- `skills/artifacts/app/comment-watch.cjs`：`ryugi-answers` 的消息改成 `Ryugi answers document/x submitted (5 questions). Apply each answer, then settle it with comment note --ask <id>. Run: …`，不再逐条列出内容。`ryugi-choices` 同样不展开，只写 round 和 group 的数量。
- answers 的 `Run:` 加上 `--status submitted`；choices 的 `Run:` 保持 `--section groups --kind choose`。
- 删除 `askCatalog`、`decode`、`submittedAnswers` 和 `roundPicks`。计数直接从 submit 线程的 `anchor.asks` 和 round 的 groups 取，event 对象里的 `answers` / `picks` 字段一起删掉。Codex watch（`codex-comment-watch.cjs`）用的是同一个 `wakeMessage`，会跟着变。
- 评论事件不动。

### 4.5 Skill 文档

以下文档里描述 brief 字段的句子要改成新写法：

- `skills/artifacts/SKILL.md`（Reading CLI output）；
- `document.md`（Questions、Comments）；
- `artboard.md`（threads、groups）；
- `skills/brainstorming/doc-rounds.md`。

改法：讲行里出现的单词，不讲 key 名；讲 `--all`，不再写 "Follow More for every submitted question"；命令示例里不写 `--format`。按 repo 里的 `writing-skills` 来改。

## 5. 验证

1. **快照测试**：在 `ryugi-cloud/packages/artifacts/test` 里，给每个命令的每种结果（成功、空、分页、非 0 退出）各加一份 brief 快照。先写测试，再改视图。另加一条测试：渲染器收到对象字段时必须抛错。
2. **monitor 测试**：`tests/hooks/test-comment-watch.cjs` 和 `test-codex-comment-watch.cjs` 改成断言新的消息格式和 `--status submitted`；再跑 `bash tests/hooks/test-user-prompt-submit.sh`。
3. **agent 前后对比**：
   - 三个固定场景：回答提交后去 apply；回复并 resolve 一条线程；publish 失败（exit 2）后按提示恢复。
   - 两组配置：旧 CLI 配旧文档，新 CLI 配新文档，在 Haiku 上各跑 3 次。
   - 记录：工具调用次数、读错或执行错的次数、有没有 grep 或手动拼命令。
   - 结果写到 `docs/ryugi/skill-evals/2026-11-xx-brief-format.md`，格式参照 `2026-11-04-artifacts-brief-consumption.md`。
   - 通过标准：新格式的调用次数和错误次数都不多于旧格式。

## 6. 发布顺序

1. 在 ryugi-cloud 里改 CLI，把本地构建写到 `skills/artifacts/app/cli.cjs`，在上面跑对比和测试。
2. 发布 npm 的 `ryugi-artifacts`。
3. 在 ryugi 里提交 monitor 和 skill 文档的改动；删掉本地的 `cli.cjs` / `server.cjs` 副本，用 npm 版本再跑一次 monitor 测试；推到 main。

两个方向都兼容：旧插件配新 CLI 能用，因为单词没变（见第 3 节）；新插件配旧 CLI 也能用，因为 monitor 不依赖 CLI 的 brief。

## 7. 留给实现的人

- 每个视图里，"agent 下一步用得到"的字段具体是哪些。
- Next 那句话的具体措辞。
- 渲染器内部怎么拆：时间格式化、命令行拼接、记录行。
- 快照测试用什么工具、文件怎么组织。

## 8. 用到的 artifact

- `document/cli-brief-format`（`.ryugi/artifacts/document/cli-brief-format/`）：两轮讨论，所有决定都已写进正文。
  - 第 1 轮：改动范围是所有视图；默认只列要处理的；头行写要处理几条；记录用紧凑行；线程只带位置；命令走 launcher 并加 Next。
  - 第 2 轮：状态词按结果或退出码；时间用本地短格式；截断写计数加命令；报错写命令名加 Next；所有列表都用紧凑行；对象由视图自己展开，用快照锁住；用 agent 前后对比来验证。
