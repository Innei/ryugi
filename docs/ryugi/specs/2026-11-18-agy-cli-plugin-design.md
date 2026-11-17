# Antigravity CLI (`agy`) 完整插件与统一安装器设计规格（Written Design）

## 1. 意图与背景（Intent & Why）

仓库最初接入 Antigravity CLI（`agy`）时，由于旧版 `agy` 没有 `SessionStart` 钩子且不支持扩展声明上下文文件，只能采用仅含 `.antigravity-plugin/plugin.json` 的「技能描述索引软触发」方案。同时，`skills/using-ryugi/references/antigravity-tools.md` 仍停留在早期 IDE 工具名（如 `write_to_file` / `replace_file_content`），与当前 `agy` CLI（1.5.10）暴露的真实工具集和 `agy plugin validate` 输出脱节；`ryugi-artifacts` 的统一安装器（`ryugi install / update / doctor / uninstall`）也尚未识别和支持 `agy`。

本设计的目标是将 Antigravity CLI（`agy`）提升为与 Claude Code、Codex、Pi 同等的一等公民（First-class harness）：通过原生 `hooks.json` 实现每次会话自动注入 `using-ryugi` bootstrap、打开的 Artboard/Document/Whiteboard 选区与未读评论提醒、Agent 生命周期状态同步与回合结束自动 flush、后台实时评论/选项唤醒（Comment Watch），并在 `ryugi-artifacts` CLI 统一安装器中完整支持 `agy`（兼容 `antigravity` 别名）。

## 2. 目标、非目标与反目标（Goals, Non-Goals & Anti-Goals）

- **Goals（目标）**：
  - **SessionStart 自动 Bootstrap**：在 `full` 模式下，每次新会话启动时通过 `SessionStart` 钩子返回 `injectSteps`（注入包裹在 `<EXTREMELY_IMPORTANT>` 中的 `using-ryugi` 内容与工具映射指引）。
  - **Artifacts 生命周期钩子**：通过 `PreInvocation` 钩子注入当前打开的 Artboard/Document/Whiteboard 选区上下文、未读评论提醒及 Cloud 自动发布状态；通过 `PreToolUse` / `PostToolUse` / `Stop` 钩子向本地 artifacts server 报告 `Antigravity` 会话状态并在回合结束时自动 flush 变更。
  - **实时评论与选项唤醒（Comment Watch）**：当会话通过 `ryugi.cjs start --artifact` 打开文档或画板后，后台 watcher 监听评论与选项提交，通过本地 Language Server Connect RPC（`SendAgentMessage` / `SendUserCascadeMessage`）实时唤醒或排队通知当前 `agy` 会话，同时以 `PreInvocation` 钩子作为兜底。
  - **更新工具映射与测试套件**：重写 `skills/using-ryugi/references/antigravity-tools.md` 覆盖 `agy` 真实工具名与技能读取方式，更新 `tests/antigravity/` 与 `tests/hooks/` 测试套件。
  - **CLI 统一安装器支持 `agy`**：在 `ryugi-cloud/packages/artifacts` 的安装器中新增 `agy` target（兼容 `--harness antigravity` 别名），支持检测 `agy` CLI、打包生成零警告的原生插件目录、调用 `agy plugin install / uninstall / list --json` 完成安装、升级、`doctor` 校验与卸载，并将构建产物同步回本仓库。
- **Non-Goals（非目标）**：
  - 不开发 Antigravity 2.0 桌面端专属的 Auxiliary Pane Sidecar（Ryugi 保持统一本地浏览器 + Cloud 架构）。
  - 不修改 `skills/*/SKILL.md` 中的通用动作描述文本（仅维护平台适配指针与 `antigravity-tools.md`）。
- **Anti-Goals（反目标）**：
  - 绝不直接修改用户的 `~/.gemini/config/config.json` 或 `~/.gemini/GEMINI.md`（严格遵守 Rule 2，所有配置与插件文件仅通过插件包本身和 `agy plugin install / uninstall` 交付）。
  - 不在本仓库根目录直接提交顶层 `hooks.json`（避免污染共享仓库根的 Cursor / Claude 插件发现）。

## 3. 已确定的决策（Settled Decisions）

| 议题                       | 决定                                                                                                                                                                                                                                                | 来源                                     |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 功能范围                   | 实现全部插件能力（Bootstrap 注入、Artifacts 钩子、实时评论唤醒、工具映射与测试修复）+ CLI 安装器支持检测与管理 `agy`                                                                                                                                | 你的决定                                 |
| 根级 `hooks.json` 交付方式 | 源码维护在 `hooks/hooks-antigravity.json`；由 `ryugi install` 在生成 `agy` 插件目录时写入插件根 `hooks.json`（同时清理冗余文件使 `agy plugin validate --strict` 零警告通过）                                                                        | Round 1 确认（`hooks-delivery`）         |
| 评论/选项实时唤醒机制      | 后台 LS Connect RPC 实时唤醒（`agy-comment-watch.cjs`）+ `PreInvocation` 钩子兜底注入未读评论提醒                                                                                                                                                   | Round 1 确认（`comment-watch-delivery`） |
| 安装器 Target ID 与别名    | 主键使用 `agy`（显示名 `Antigravity`），在 `--harness` 与 `uninstall --harness` 参数解析中兼容 `antigravity` 别名                                                                                                                                   | Round 1 确认（`harness-id`）             |
| 原生安装与校验命令         | 受管插件保存在 `$INSTALL_ROOT/plugins/agy/plugin`，调用 `agy plugin install <target>`、`agy plugin uninstall ryugi`、`agy plugin list --json` 完成安装、卸载与 `doctor` 校验                                                                        | Round 1 确认（`native-install-command`） |
| 跨仓库同步构建             | 同时更新 `/Users/innei/git/innei-repo/ryugi-cloud/packages/artifacts` 与本仓库，跑通两边测试并同步构建产物（`output-bootstrap.cjs` 等）                                                                                                             | Round 1 确认（`cross-repo-sync`）        |
| 工具映射更新               | 更新 `antigravity-tools.md` 映射 `read_file`、`write_file`、`edit_file`、`run_command`、`grep_search`、`find_by_name`、`list_dir`、`read_url_content`、`search_web`、`invoke_subagent`、`ask_question`，并保留旧工具名别名说明与 task artifact 说明 | 我的判断（My call）                      |
| Viewer Agent 状态展示      | 扩展 `agent-event.cjs` 与 `ryugi-artifacts` 的 `AgentHost` 支持 `antigravity`（解析 camelCase 钩子 payload），在 Viewer 显示 `Antigravity` 状态胶囊                                                                                                 | 我的判断（My call）                      |

## 4. 架构与组件设计（Architecture & How It Works）

### 4.1 Antigravity 钩子配置与输入/输出协议适配

`agy` 的 `hooks.json` 采用顶层命名钩子对象格式，且 stdin 输入和 stdout 输出均为 camelCase JSON（protojson）：

- **钩子配置文件（`hooks/hooks-antigravity.json`）**：
  - `SessionStart`：调用 `"./hooks/run-hook.cmd" session-start`（注入 bootstrap 并启动后台 comment watcher）。
  - `PreInvocation`：调用 `"./hooks/run-hook.cmd" user-prompt-submit`（在每次调用模型前检查是否有打开的选区、未读评论提醒或自动发布提示，若存在则包装为 `{"injectSteps":[{"systemMessage":{"systemMessage":"..."}}]}` 输出，否则输出 `{}`）。
  - `PreToolUse`（`"matcher": "*"`）：调用 `"./hooks/run-hook.cmd" agent-event`，向本地 artifacts server 汇报正在运行的工具及文件，并在 stdout 返回 `{"decision":"allow"}` 以放行工具执行。
  - `PostToolUse`（`"matcher": "*"`）：调用 `"./hooks/run-hook.cmd" agent-event`，向本地 artifacts server 汇报工具完成，stdout 返回 `{}`。
  - `Stop`：调用 `"./hooks/run-hook.cmd" stop`，触发 `flush-artifacts.cjs` 并汇报回合结束，stdout 返回 `{}`（不阻塞停止）。
- **如何识别当前运行在 Antigravity 钩子中**：
  - `agy` 执行插件钩子时会注入环境变量 `ANTIGRAVITY_AGENT=1`（以及 `PLUGIN_ROOT`、`ANTIGRAVITY_CONVERSATION_ID` 等），且 stdin JSON 包含 camelCase 的 `hookEventName`（`SessionStart`、`PreInvocation`、`PreToolUse`、`PostToolUse`、`Stop`）和 `conversationId`、`cwd`。
  - **`hooks/session-start`**：当检测到 `ANTIGRAVITY_AGENT` 非空时：
    1. 从 stdin JSON（`cwd` 或 `workspacePaths[0]`）解析项目根目录，若有已发布文档则在后台启动 artifacts server。
    2. 若安装了后台评论监听脚本（`skills/artifacts/app/agy-comment-watch.cjs`），后台启动或刷新当前会话的 watcher。
    3. 在 `full` 模式下（`skills/using-ryugi/SKILL.md` 存在且未被替换为 artifacts-only stub），输出 Antigravity 的 `SessionStart` 契约格式：
       ```json
       {
         "injectSteps": [
           {
             "systemMessage": {
               "systemMessage": "<EXTREMELY_IMPORTANT>\nYou have Ryugi.\n\n**Below is the full content of your 'ryugi:using-ryugi' skill - your introduction to using skills. To load another skill on Antigravity, read its SKILL.md with `read_file`:**\n\n...\n</EXTREMELY_IMPORTANT>"
             }
           }
         ]
       }
       ```
       在 `artifacts` 模式下（无 `using-ryugi`），输出 `{}`。
  - **`hooks/user-prompt-submit` 与 `hooks/selection-context.cjs`**：
    - 支持从 stdin JSON 的 `cwd`（或 `workspacePaths[0]`）定位项目目录，支持从 `lastUserInput`（Antigravity `PreInvocation` 字段）或 `prompt`（Claude Code 字段）读取用户输入文本，支持从 `conversationId`（或环境变量 `ANTIGRAVITY_CONVERSATION_ID`）读取会话 ID。
    - 当检测到 Antigravity 环境（`ANTIGRAVITY_AGENT=1` 或 `input.hookEventName === 'PreInvocation'`）时：仅在 `invocationNum === 0`（或未提供 `invocationNum`）即用户刚发出消息的第一次模型调用前注入选区与提醒（避免同一回合内每次工具调用后的模型重入重复注入相同选区），并将输出包装为 `{"injectSteps":[{"systemMessage":{"systemMessage":"..."}}]}`；若无内容则输出 `{}`。
  - **`hooks/agent-event` 与 `skills/artifacts/app/agent-event.cjs`**：
    - 扩展 `eventFrom(input, host, at)` 兼容 Antigravity 的 camelCase payload：`session = input.session_id || input.conversationId || process.env.ANTIGRAVITY_CONVERSATION_ID`，`event = input.hook_event_name || (input.hookEventName === 'PreInvocation' ? 'UserPromptSubmit' : input.hookEventName)`。
    - 在 `PreToolUse` 时，兼容读取 `input.tool_input` 或 `input.toolCall?.args`，除原有的 `file_path / path / notebook_path` 外，增加提取 Antigravity 工具参数中的大写 `Path`（如 `read_file`、`write_file`、`edit_file` 的 `Path`），以及将 `ask_question` 加入等待用户交互工具集合。
    - 当处于 Antigravity 钩子环境时，`hooks/agent-event` 在 `PreToolUse` 事件输出 `{"decision":"allow"}`，在 `PostToolUse` / `PreInvocation` 输出 `{}`，确保严格符合 `agy` 钩子 stdout 契约。
  - **`hooks/stop` 与 `hooks/flush-artifacts.cjs`**：
    - 从 stdin JSON 的 `cwd`（若无则回退 `$PWD`）解析项目根，触发 `/api/cloud/flush` 和 `/api/agent/event`（`Stop`），在 Antigravity 环境下 stdout 输出 `{}`。

### 4.2 实时评论与选项唤醒（`agy-comment-watch.cjs`）

- **会话订阅注册（`comment-subscriptions.cjs` & `ryugi.cjs`）**：
  - 在 `HOSTS` 中新增 `antigravity: { env: 'ANTIGRAVITY_CONVERSATION_ID', dir: 'agy-comment-watch' }`。
  - 当 `agy` 在 `run_command` 中执行 `node .../ryugi.cjs start --artifact <type>/<id>` 时，环境变量中天然带有 `ANTIGRAVITY_CONVERSATION_ID`（UUID 格式）。`ryugi.cjs` 自动调用 `comment-subscriptions.cjs` 的 `register()` 将该 artifact 记录到 `.ryugi/artifacts/.state/agy-comment-watch/<session>.json`。
- **后台监听与投递（`skills/artifacts/app/agy-comment-watch.cjs`）**：
  - 在 `SessionStart` 和 `PreInvocation` 时确保当前 `conversationId` 有一个单实例后台 watcher 进程（通过 `PLUGIN_DATA` 或 `.ryugi/artifacts/.state/agy-comment-watch/workers/<session>.json` 锁文件防重，与 `codex-comment-watch.cjs` 相同的 claim/heartbeat 机制）。
  - 每秒轮询当前会话订阅的 artifacts，使用 `createCommentWatch(project, 'Antigravity')` 生成评论/选项事件与 `wakeMessage(event)`。
  - 投递路径：优先使用钩子/命令继承的 `ANTIGRAVITY_LS_ADDRESS` 和 `ANTIGRAVITY_CSRF_TOKEN`，向本地 Language Server 发起 HTTP POST：
    1. 调用 `/exa.language_server_pb.LanguageServerService/SendAgentMessage`（传入 `recipient: session`, `senderId: "ryugi-artifacts"`, `displayTitle: "Ryugi Artifacts"`, `content: wakeMessage(event)`），利用 `agy` 内置的 Reactive Wakeup 机制在会话空闲时自动唤醒模型，或在忙碌时排队投递。
    2. 若 `SendAgentMessage` 返回不可用，回退尝试 `/exa.language_server_pb.LanguageServerService/SendUserCascadeMessage`（`cascadeId: session`, `messageText: wakeMessage(event)`, `continueExecution: true`）。
  - 若 RPC 投递失败，采用指数退避重试；同时如果用户在终端主动发消息，`PreInvocation` 钩子中的 `selection-context.cjs` 也会通过 `commentReminders` 兜底注入未读评论提醒。

### 4.3 工具映射与文档更新（`antigravity-tools.md`）

- 重写 `skills/using-ryugi/references/antigravity-tools.md`，完整列出动作到 `agy` 工具的映射：
  - 读取文件 → `read_file`
  - 创建文件 → `write_file`
  - 编辑文件 → `edit_file`
  - 运行 Shell 命令 → `run_command`（优先在沙箱内运行，需要网络或跨目录写权限时传 `BypassSandbox: true`）
  - 搜索文件内容 → `grep_search`
  - 按名称查找文件 → `find_by_name`
  - 列出目录内容 → `list_dir`
  - 读取网页 / 搜索网页 → `read_url_content` / `search_web`
  - 向人类提问（单选/多选） → `ask_question`
  - 调用技能（Invoke a skill） → 使用 `read_file` 读取对应技能的 `SKILL.md`（因为 `agy` 会自动在系统提示词的 `<skills>` 块中列出所有已安装技能的名称、描述和 `SKILL.md` 绝对路径，无单独的 `Skill` 工具）。
  - 派发子 Agent（Dispatch a subagent） → `invoke_subagent`（内置 `TypeName: "self"` 或 `"research"`）。
  - 任务跟踪（Task tracking） → 在 Artifact 目录下使用 `write_file` / `edit_file`（配合 `ArtifactMetadata`）维护任务清单 artifact（并在括号中保留旧版 IDE 工具名 `write_to_file` / `replace_file_content` 的兼容说明，确保旧测试与跨版本引用平滑过渡）。

### 4.4 `ryugi-artifacts` CLI 统一安装器支持 `agy`

在 `/Users/innei/git/innei-repo/ryugi-cloud/packages/artifacts` 中扩展安装器模块：

1. **`src/cli/installer/state.ts` & `plan.ts`**：
   - 将 `'agy'` 加入 `Harness` 联合类型。
   - 在 `makePlan` 解析 `--harness` 以及 `uninstall` 解析 `--harness` 时，支持将输入的 `antigravity` 归一化为 `agy`（`normalizeHarness`）。
2. **`src/cli/installer/harnesses.ts`**：
   - 在 `HARNESSES` 注册表中加入：`{ id: 'agy', command: 'agy', label: 'Antigravity', comments: 'native hooks + LS watch' }`。
   - `detectHarnesses`：通过运行 `agy --version` 检测 `agy` 是否在 `PATH` 上。
   - `installHarness('agy', pkg, options)`：
     - 首次安装前检查 `agy plugin list --json` 是否已存在非本安装器管理的 `ryugi` 插件（若存在且无 `previous` 记录，提示先通过 `agy plugin uninstall ryugi` 移除）。
     - 将打包好的候选插件目录放到受管路径 `$INSTALL_ROOT/plugins/agy/plugin`。
     - 将 `hooks/hooks-antigravity.json` 写入 `target/hooks.json`，并移除 `target/hooks/hooks.json`、`target/hooks/hooks-cursor.json`、`target/GEMINI.md`、`target/gemini-extension.json`、`target/AGENTS.md`，使该目录成为纯粹、零警告的 Antigravity 原生插件。
     - 调用 `agy plugin install <target>` 将插件安装到 `~/.gemini/config/plugins/ryugi`，记录 `registration: 'ryugi'` 并重算 `digest: treeDigest(target)`。
3. **`src/cli/installer/package.ts`**：
   - 在 `sealPlugin` 的拷贝列表中包含 `.antigravity-plugin`，并在写入版本戳的 manifest 列表中加入 `.antigravity-plugin/plugin.json`。
   - 在 `validatePlugin` 中校验 `harness === 'agy'` 所需的 `.antigravity-plugin/plugin.json`、`hooks/hooks-antigravity.json`、`hooks/run-hook.cmd`、`hooks/session-start`、`hooks/user-prompt-submit`、`hooks/stop`、`hooks/agent-event` 以及 `skills/artifacts/app/agy-comment-watch.cjs`。
4. **`src/cli/installer/native-state.ts` & `lifecycle.ts`**：
   - `nativeRegistrationMatches`：当 `record.harness === 'agy'` 时，运行 `agy plugin list --json`，校验返回的数组中存在 `name === 'ryugi'` 且 `enabled !== false` 且 `version === JSON.parse(fs.readFileSync(path.join(target, '.antigravity-plugin/plugin.json'), 'utf8')).version`。
   - `uninstallManaged`：当 `harness === 'agy'` 时，调用 `agy plugin uninstall ryugi` 并删除受管的 `record.path`。

## 5. 留给实现者的细节（Left to the Builder）

- `agy-comment-watch.cjs` 内部与 Language Server 通信的超时时间（建议单次 RPC 5s 超时）与锁文件清理细节。
- `tests/antigravity/test-plugin-manifest.sh` 中对 `agy plugin validate` 的调用适配：除了校验仓库根目录的 manifest 字段外，构造与安装器一致的 staged 插件目录运行 `agy plugin validate --strict` 验证零错误零警告。

## 6. 关联的 Artifacts 记录

- **Document**：`document/agy-cli-plugin`（路径：`.ryugi/artifacts/document/agy-cli-plugin/doc.xml`，链接：https://ryugi.innei.dev/a/N5o7riRcIUPztlJ6qjhen）——第 1 轮共 5 个问题全部按推荐项确认通过（`hooks-delivery`、`comment-watch-delivery`、`harness-id`、`native-install-command`、`cross-repo-sync`）。
