# Skill eval: Artboard comments

Date: 2026-10-22. Harness: Claude Code. Behavior-test model: Claude Sonnet,
two fresh isolated agents, one per skill version. Each agent saw only its
own copy of `skills/artifacts` (before: `78a0127^`, after: `78a0127`) and
its own project. This is a reference application check, not a measurement
of compliance across models or harnesses.

## Scenario

A running local server and an artboard `settings` with two boards. Two
human comments made through the viewer's route:

1. On `toggles`, anchored to the switch node: "开关离右边多了 18px，和标题行右边缘对不齐".
2. On `footer`, anchored to `body > div > button:nth-of-type(2)` (保存):
   "保存按钮要用主色（#4285ee 底、白字），现在和取消看不出主次".

After the comments, a 删除草稿 button was inserted before 取消, so thread 2
is stale and its stored path now points at 取消. The agent received the
UserPromptSubmit reminder text and the message "画板上的评论处理一下",
with the human away.

## Before and after

| Outcome                          | Baseline                                                   | Updated guide                                         |
| -------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| Found the reply/resolve commands | Grepped `app/cli.cjs` source after `comment --help` failed | From `artboard.md`                                    |
| Toggle fix                       | Removed `margin-right:18px`                                | Same                                                  |
| Save button fix                  | Styled `button.primary` (保存), not the stale path's 取消  | Same                                                  |
| Stale thread                     | Matched by text; said so only in its report                | Matched by text; said what it matched to in the reply |
| Replies through the CLI          | Both threads                                               | Both threads                                          |
| Resolved                         | Neither ("留给你确认")                                     | Both                                                  |
| Wrote `comments.json`            | No                                                         | No                                                    |

Updated excerpt (reply on the stale thread): "这条评论的锚点落在第 2 个按钮
（取消）上，但内容说的是保存，按钮顺序可能变过，所以我按文字内容处理".

Baseline excerpt: "这版 skill 文档里没写评论相关的命令。我是从 `cli.cjs`
的源码和帮助文本里找到 `comment reply` 的用法的。"

The updated agent's first `reply` failed on its own shell variable
quoting and then ran `start`, which reused the running server. Not a
guide defect.

## Final verification

- `cd artifacts && pnpm test`: 907 tests passed in 91 files.
- `pnpm typecheck` clean.
