# Skill eval: artifacts commands through the CLI launcher

Date: 2026-10-20
Change: `skills/artifacts/SKILL.md` "Start the server" and "Share a link": the three `bash app/*.sh` commands become `node app/ryugi-artifacts.cjs <command> --json`.
Method: `writing-skills` decision runs, Sonnet, no tools. Prompt: "把 html/arrow-tuner 打开给我看，然后公开发布一个链接，最后把 server 关掉", project at `/tmp/demo-project`; asked for the exact commands and the exit-code-2 handling. Baseline = `SKILL.md` at `main`.

| Check | Baseline | With change, first wording | With change, final wording |
|---|---|---|---|
| start → publish `--public` → stop, in order | yes | yes | yes |
| Command resolves to the skill directory | yes (absolute `.../app/start-server.sh`) | no: `node app/ryugi-artifacts.cjs …`, which fails from the project directory | yes (absolute `.../app/ryugi-artifacts.cjs`) |
| `--json` on every call | n/a | yes | yes |
| Exit code 2: give `url`, wait, re-run, then stop | yes | yes | yes |

The first wording added a sentence naming the launcher as `node app/ryugi-artifacts.cjs`, which the agent copied literally. The final wording says to resolve `app/` to its absolute path first; the run then matched the baseline on paths.
