# Skill eval: verify groups and media boards

Date: 2026-10-22. Harness: Claude Code. Behavior-test model: Claude Sonnet,
fresh isolated agents, one per skill version and scenario. Each agent saw
only its own copy of `skills/artifacts` (before: without the media-board and
Verify groups text in `artboard.md`; after: with it) and its own project.
The app and server were the same block 2 build in both, so a baseline agent
could in principle find the fields by reading the bundled server. This is a
reference application check, not a measurement of compliance across models.

## Scenario A: handle a reject

An artboard `digest-verify` with a verify group (an HTML design board and
an image board). A human reject on the group: "截图是旧的：摘要标题已经改过了，
换成新截图。另外加一段打开摘要的录屏，放进这个 group。新文件都在项目的
evidence/ 目录里。" The agent got the UserPromptSubmit reminder and
"画板上的验收意见处理一下".

| Outcome                                                            | Baseline                                  | Updated guide                             |
| ------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------- |
| Replaced the screenshot in place                                   | Yes                                       | Yes                                       |
| Added a `type: video` board with `src` under `pages/` to the group | Yes, copied from the existing image board | Yes, from `artboard.md`                   |
| Replied on the reject thread                                       | Yes                                       | Yes                                       |
| Left the reject open                                               | Yes, inferred from the list output        | Yes, cites that `resolve` refuses rejects |
| Tool calls / time                                                  | 15 / 88 s                                 | 8 / 30 s                                  |

The fixture already contained an image board, so the baseline copied the
format. No behaviour difference on outcome.

## Scenario B: create a verify group from scratch

An artboard `settings` with one approved HTML board in group `q1` and no
media boards. `evidence/` holds `notify-after.png` and `notify-flow.webm`.
Message: "通知设置页做完了。evidence/ 里有实际截图 notify-after.png 和交互录屏
notify-flow.webm。放到 settings 画板上，跟已批准的设计放一组，做成需要我点通过
或打回的验收组。"

| Outcome                                         | Baseline                                                                                       | Updated guide             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------- |
| Copied evidence under `pages/`                  | Yes                                                                                            | Yes                       |
| `type: image` / `type: video` boards with `src` | Yes, found by grepping `app/server.cjs`                                                        | Yes, from `artboard.md`   |
| `"verify": true` on the group                   | Yes, same source                                                                               | Yes                       |
| Confidence                                      | "这份 artboard.md 没写图片和视频 board，也没写验收组 … 是我从 server.cjs 的校验代码里读出来的" | No doubt about the format |
| Tool calls / time                               | 15 / 71 s                                                                                      | 9 / 30 s                  |

Both canvases validated with no warnings. Without the guide the agent had
to reverse-engineer the bundled server; with it the agent followed the
documented shape directly.

## Setup notes

Servers started from the evaluator's shell exit with their owner process,
so one baseline agent saw "No artifacts server is running" and restarted
it. Auto-publish was turned off per project for these fixtures.

## Final verification

- `cd artifacts && pnpm test`: 954 tests passed in 96 files.
- `pnpm typecheck` clean.
