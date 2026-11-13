# 删除 reference 后的完整 GPT eval

2026-11-14（Asia/Singapore）。使用真实 Codex CLI 0.167.2、gpt-6.1-sol、medium，6 个场景 × 前后两版 × 5 次，共 60 次。两版固定使用同一个已发布 ryugi-artifacts@1.77.0（同一 CLI SHA）；变量是删除十个兼容指针文件，以及 SKILL.md 中新增的可执行 type-help 例子。

评估期间源码工作区已前进至 1.78.0；本报告仍固定在 1.77.0，不能当成 1.78.0 的验收结果。

**结论：本轮没有发现生成内容、格式或交互结构的回归；这些检查前后各 30/30。完整流程并未全绿：删除前 19/30，删除后 20/30。失败集中在最终 runtime/交接校验，不能将这些样本算作完成。**

| 场景                   | 删除前完整通过 | 删除后完整通过 | 类型内容检查（前 → 后） |
| ---------------------- | -------------: | -------------: | ----------------------: |
| 处理文档评论           |            5/5 |            5/5 |               5/5 → 5/5 |
| 创建文档、原生图和问题 |            5/5 |            5/5 |               5/5 → 5/5 |
| 创建 Artboard 选项     |            0/5 |            0/5 |               5/5 → 5/5 |
| 创建 HTML 交互控件     |            2/5 |            2/5 |               5/5 → 5/5 |
| 创建原生白板流程       |            2/5 |            3/5 |               5/5 → 5/5 |
| 创建 Verify 证据报告   |            5/5 |            5/5 |               5/5 → 5/5 |

“类型内容检查”是辅助诊断，涵盖原生结构、内容、绑定、真实控件结果及人类状态；它不替代完整通过条件。主通过率仍要求当前 CLI Check clean、agent 实际成功执行 Check、进程成功并遵守 CLI 操作范围。

三个完整通过的场景可作初步 token 对照：

| 场景                   | 总 token 中位数（前 → 后） |  变化 | 工具调用中位数 |
| ---------------------- | -------------------------: | ----: | -------------: |
| 处理文档评论           |          113,529 → 104,129 | -8.3% |         9 → 11 |
| 创建文档、原生图和问题 |            93,540 → 93,691 | +0.2% |          5 → 6 |
| 创建 Verify 证据报告   |          147,049 → 137,787 | -6.3% |          7 → 6 |

总 token 为 API 报告的 input（含 cached input）加 output；uncached/cached 分项保留在 summary.json。浏览器场景有未完成样本，其 token 差异不用于收益判断。每组只有 5 次，且有并发模型和浏览器负载；这些数字不证明稳定的 token 或耗时收益。

独立审计检查了全部 60 份原始记录、输入 skill 与 CLI 哈希、token 计数、Verify 实际服务端状态。没有源码回退。未出现任何已删除 guide 文件的实际路径提及。原始 referenceReads 是宽松启发式，会把 rg --files -g AGENTS.md 当成读取；audit.json 保留更精确的十个已删除文件核对，不能把启发式计数当成 reference 依赖。

失败可分为三类：

- **10 次 Artboard**：真实浏览器加载后 Check 仍是 runtime: unknown。独立预检以有效 canvas 和完整 HTML 复现；原生内容与未提交的人类选择均正确。未修改已发布 CLI 来掩盖这个共同阻断。
- **10 次 HTML/白板交接**：agent 曾经 Check clean，最后再次 start 后输出端口改变，当前服务端失去浏览器已运行证据；最终 Check 为 browser_not_run。普通父进程中两次 start 的对照能复用端口，故本轮只确认 Codex 运行链上的现象，未隔离全部根因。
- **1 次 HTML**：browser-ready-html-candidate-5 仍遇到 Chrome profile/启动环境错误，未获得成功的 agent Check。独立 grader 打开实际内容后验证了控件行为，但主流程仍判失败；这个残留环境因素不能归因于 reference 删除。

另有 **10 次原浏览器环境尝试**（4 次自然失败、6 次主动取消）单独保存。Chrome 从嵌套的 Codex workspace sandbox 启动失败后，修正为父评估程序预启动命名浏览器；新批次使用 browser-ready- 标签。旧记录没有覆盖或混入 60 次主矩阵的通过率，详见 infrastructure-summary.json 与 infrastructure-cancellations.json。

本轮覆盖五种 artifact 的代表性创建和文档评论处理；HTML 通过真实 Chrome 操作滑块和内置开关，白板检查绑定、几何和渲染。未评价视觉审美，也未做真实 Cloud 发布、所有控件枚举或各类型全部编辑操作。

失败样本完整列表：

| 样本                                   | 未通过检查                | 最终状态 |
| -------------------------------------- | ------------------------- | -------- |
| `browser-ready-artboard-baseline-1`    | checkClean, agentRanCheck | unknown  |
| `browser-ready-artboard-baseline-2`    | checkClean, agentRanCheck | unknown  |
| `browser-ready-artboard-baseline-3`    | checkClean, agentRanCheck | unknown  |
| `browser-ready-artboard-baseline-4`    | checkClean, agentRanCheck | unknown  |
| `browser-ready-artboard-baseline-5`    | checkClean, agentRanCheck | unknown  |
| `browser-ready-artboard-candidate-1`   | checkClean, agentRanCheck | unknown  |
| `browser-ready-artboard-candidate-2`   | checkClean, agentRanCheck | unknown  |
| `browser-ready-artboard-candidate-3`   | checkClean, agentRanCheck | unknown  |
| `browser-ready-artboard-candidate-4`   | checkClean, agentRanCheck | unknown  |
| `browser-ready-artboard-candidate-5`   | checkClean, agentRanCheck | unknown  |
| `browser-ready-html-baseline-1`        | checkClean                | pending  |
| `browser-ready-html-baseline-3`        | checkClean                | pending  |
| `browser-ready-html-baseline-5`        | checkClean                | pending  |
| `browser-ready-html-candidate-2`       | checkClean                | pending  |
| `browser-ready-html-candidate-3`       | checkClean                | pending  |
| `browser-ready-html-candidate-5`       | checkClean, agentRanCheck | pending  |
| `browser-ready-whiteboard-baseline-1`  | checkClean                | pending  |
| `browser-ready-whiteboard-baseline-4`  | checkClean                | pending  |
| `browser-ready-whiteboard-baseline-5`  | checkClean                | pending  |
| `browser-ready-whiteboard-candidate-1` | checkClean                | pending  |
| `browser-ready-whiteboard-candidate-2` | checkClean                | pending  |

[机器汇总](summary.json)、[独立审计](audit.json)、[固定输入与哈希](manifest.json)、[真实夹具预检](preflight.json)、[父进程 repeat-start 对照](repeat-start.json)。逐次原始 JSONL、prompt、stderr、原生文件和状态在忽略提交的 runs/ 中保留，包括 infrastructure-chrome-sandbox/。

复现工具位于 sibling ryugi-cloud 的 packages/artifacts/eval/agent-cli/。使用新实验目录，保留输入快照、同版本 CLI、同一 GPT 设置和 grader；不要修改这次已观察结果。README.md 说明完整六场景矩阵、浏览器宿主边界、样本计数及失败保留规则。
