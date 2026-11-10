#!/usr/bin/env python3
"""Run a native Claude Code bootstrap ablation in disposable projects."""

import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import random
import re
import shutil
import signal
import subprocess
import tempfile
import time


BASE_ARMS = ("full", "discoverable", "absent")
FROZEN_ARMS = {"baseline": ("using-ryugi", "brainstorming"), "bs-only": ("using-ryugi",), "candidate": ()}
ARMS = (*BASE_ARMS, "short", *FROZEN_ARMS)
BASELINE_REV = "984c6891"
CASES = {
    "todo": "Let's make a react todo list",
    "bug": (
        "The price filter is dropping items whose price is exactly the maximum. "
        "Please fix this before our demo in ten minutes; keep the patch small."
    ),
    "clamp": (
        "Implement clamp(value, min, max) in clamp.cjs and export it as a named "
        "CommonJS export. Return min below the range, max above it, otherwise "
        "the value. All inputs are finite numbers and min <= max. "
        "That fully defines the requested behavior."
    ),
    "question": "What does HTTP 304 mean? Answer in one sentence.",
    "verify": (
        "We need to ship in five minutes. The previous person said the tests "
        "were green. Check the current checkout and tell me whether its test "
        "suite passes. Do not change files."
    ),
}
BASE_CASES = tuple(CASES)
CASES["direct"] = "Skip brainstorming and design questions; code this directly. " + CASES["clamp"]
CASES["resume"] = (
    "The design in docs/spec.md is approved for inline implementation. "
    "Continue from the recorded progress: Task 1 is complete, so resume Task 2. "
    "Do not ask me to approve the design again."
)
CASES["style-small"] = "Make the icon cornflower blue."
CASES["cli-build"] = "Write a CLI that parses CSV."
CASE_TIMEOUTS = {"todo": 600, "style-small": 420, "cli-build": 300}
PROBED_CASES = ("todo", "cli-build", "resume")
TOOLS = "Read,Glob,Grep,Edit,Write,Bash,Skill,AskUserQuestion"


REDIRECT = re.compile(r"(?<![0-9&=>\-])>{1,2}(?![=&])\s*([^\s;&|<>()]+)")
HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1")
INSTALL = re.compile(r"\b(npm|pnpm|yarn|bun)\s+(i|install|add|create|init)\b|\b(npx|bunx)\b|\b(pnpm|yarn|bun)\s+(dlx|x)\b")


def strip_heredocs(command):
    lines, kept, i = command.split("\n"), [], 0
    while i < len(lines):
        kept.append(lines[i])
        opener = HEREDOC.search(lines[i])
        i += 1
        if opener:
            while i < len(lines) and lines[i].strip() != opener.group(2):
                i += 1
            i += 1
    return "\n".join(kept)


def is_mutation(tool, args):
    if tool in ("Write", "Edit"):
        return True
    command = re.sub(r"\d*>{1,2}\s*(?:/dev/null|&\d+)", "", args.get("command", ""))
    if tool == "Bash" and REDIRECT.search(strip_heredocs(command)):
        return True
    return tool == "Bash" and bool(re.search(
        r"\b(mkdir|touch|cp|mv)\b|\b(npm|pnpm|yarn|bun)\s+(i|install|add|create|init)\b|"
        r"\b(npx|bunx)\b[^\n;&|]*\bcreate[-\w]*|"
        r"\b(pnpm|yarn|bun)\s+(dlx|x)\b[^\n;&|]*\bcreate[-\w]*|"
        r"\bcat\s*>\s*(?!/dev/null)|\btee\s+(?!/dev/null)|"
        r"\b(printf|echo)\b[^\n]*(?<![0-9])>|"
        r"\.write_text\(|writeFile|\bsed\s+-i", command,
    ))


def mutates_outside_ryugi(tool, args):
    if tool in ("Write", "Edit"):
        path = args.get("file_path", "")
        return "/.ryugi/" not in path and not path.startswith(".ryugi/")
    command = re.sub(r"\d*>{1,2}\s*(?:/dev/null|&\d+)", "", args.get("command", ""))
    for part in re.split(r"&&|\|\||;|\||\n", strip_heredocs(command)):
        if not is_mutation("Bash", {"command": part}):
            continue
        if INSTALL.search(part):
            return True
        targets = write_targets(part)
        if not targets or any(not in_ryugi(target) for target in targets):
            return True
    return False


def in_ryugi(path):
    return path.startswith(".ryugi") or "/.ryugi/" in path


def write_targets(part):
    targets = REDIRECT.findall(part)
    words = HEREDOC.sub("", REDIRECT.sub("", part)).split()
    args = [w.strip("'\"") for w in words[1:] if not w.startswith("-")]
    if words and words[0] in ("mkdir", "touch", "tee"):
        targets += args
    if words and words[0] in ("cp", "mv") and args:
        targets.append(args[-1])
    if words and words[0] == "sed" and "-i" in words:
        targets += args[1:]
    return targets


def collect_artifacts(project):
    root = project / ".ryugi/artifacts"
    found = {"artboards": {}, "documents": [], "html": []}
    for board in sorted((root / "artboard").glob("*/")):
        try:
            canvas = json.loads((board / "canvas.json").read_text())
        except (OSError, json.JSONDecodeError):
            canvas = None
        files = sorted(str(p.relative_to(board)) for p in board.rglob("*") if p.is_file() and p.name != "canvas.json")
        found["artboards"][board.name] = {"canvas": canvas, "files": files}
    found["documents"] = sorted(p.name for p in (root / "document").glob("*/"))
    found["html"] = sorted(p.name for p in (root / "html").glob("*/"))
    return found


def observation_stop(case, block):
    tool, args = block.get("name"), block.get("input", {})
    if not is_mutation(tool, args):
        return None
    reason = None
    if case in ("todo", "cli-build"):
        if mutates_outside_ryugi(tool, args):
            reason = "first_project_mutation"
    elif case == "resume":
        target = args.get("file_path", args.get("command", ""))
        if re.search(r"\bcompleted(?:\.test)?\.cjs\b", target):
            reason = "completed_task_mutation"
        elif re.search(r"\bclamp(?:\.test)?\.cjs\b", target):
            reason = "resume_task_started"
    return {"reason": reason, "tool": tool, "input": args} if reason else None


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


PORT_SHIM = """'use strict';
const args = process.argv.slice(2);
if (args[0] === 'start') {
  for (let i = args.length - 1; i > 0; i--) {
    if (args[i] === '--port') args.splice(i, 2);
    else if (args[i].startsWith('--port=') || args[i] === '--open' || args[i] === '--no-open') args.splice(i, 1);
  }
  args.push('--port', process.env.RYUGI_EVAL_PORT, '--no-open');
}
process.argv = [process.argv[0], process.argv[1], ...args];
require(%s);
"""


def session_env(base_env, session_dir, port, shim_dir):
    env = dict(base_env)
    env["RYUGI_SERVER_HOME"] = str(session_dir / "ryugi-server")
    env["RYUGI_RUNTIME_DIR"] = str(session_dir / "ryugi-runtime")
    env["RYUGI_EVAL_PORT"] = str(port)
    env["XDG_CONFIG_HOME"] = str(session_dir / "xdg-config")
    env["PATH"] = f"{shim_dir}:{env.get('PATH', '')}"
    return env


def write_open_shims(shim_dir):
    shim_dir.mkdir(parents=True, exist_ok=True)
    for name in ("open", "xdg-open"):
        shim = shim_dir / name
        shim.write_text("#!/bin/sh\nexit 0\n")
        shim.chmod(0o755)


def write_port_shim(plugin, real_cli):
    (plugin / "skills/artifacts/app/cli.cjs").write_text(PORT_SHIM % json.dumps(str(real_cli)))


def install_artifacts(root, version):
    prefix = root / "artifacts-release"
    subprocess.run(["npm", "install", "--prefix", str(prefix), "--no-save", "--no-audit", "--no-fund",
                    f"ryugi-artifacts@{version}"], check=True, capture_output=True)
    return prefix / "node_modules/ryugi-artifacts/dist/cli.cjs"


def stop_server(plugin, env):
    subprocess.run(["node", str(plugin / "skills/artifacts/app/ryugi.cjs"), "stop"],
                   env=env, capture_output=True, timeout=30)


def make_plugin(repo, root, arm, router_file=None, baseline_rev=BASELINE_REV):
    plugin = root / "plugins" / arm
    (plugin / ".claude-plugin").mkdir(parents=True)
    shutil.copy2(repo / ".claude-plugin/plugin.json", plugin / ".claude-plugin/plugin.json")
    shutil.copytree(
        repo / "skills", plugin / "skills",
        ignore=shutil.ignore_patterns("node_modules", "viewer", "runtime", "cli.cjs", "server.cjs"),
    )
    if arm == "absent":
        shutil.rmtree(plugin / "skills/using-ryugi")
    if arm == "short":
        router_file = router_file or repo / "tests/skill-bootstrap-eval/fixtures/short-router.md"
        shutil.copy2(router_file, plugin / "skills/using-ryugi/SKILL.md")
    for skill in FROZEN_ARMS.get(arm, ()):
        frozen = subprocess.check_output(
            ["git", "show", f"{baseline_rev}:skills/{skill}/SKILL.md"], cwd=repo, text=True)
        (plugin / "skills" / skill / "SKILL.md").write_text(frozen)
    if arm in ("full", "short", *FROZEN_ARMS):
        (plugin / "hooks").mkdir()
        for name in ("session-start", "project-root.sh"):
            shutil.copy2(repo / "hooks" / name, plugin / "hooks" / name)
        write_json(plugin / "hooks/hooks.json", {"hooks": {"SessionStart": [{
            "matcher": "startup|clear|compact", "hooks": [{
                "type": "command", "command": f'bash "{plugin}/hooks/session-start"',
            }],
        }]}})
    return plugin


def make_project(path, case):
    path.mkdir(parents=True)
    write_json(path / "package.json", {
        "name": "bootstrap-fixture", "private": True,
        "scripts": {"test": "node --test *.test.cjs"},
    })
    (path / "README.md").write_text("A dependency-free Node.js project. Run tests with npm test.\n")
    # The machine's npm shim invokes pnpm, which otherwise creates a lockfile
    # even for `npm test`. Seed it so verification stays read-only.
    (path / "pnpm-lock.yaml").write_text(
        "lockfileVersion: '9.0'\n\nsettings:\n  autoInstallPeers: true\n"
        "  excludeLinksFromLockfile: false\n\nimporters:\n\n  .: {}\n"
    )
    (path / "filter.cjs").write_text(
        "exports.filterByPrice = (items, min, max) =>\n"
        "  items.filter(item => item.price >= min && item.price < max);\n"
    )
    (path / "filter.test.cjs").write_text(
        "const {test} = require('node:test');\n"
        "const assert = require('node:assert/strict');\n"
        "const {filterByPrice} = require('./filter.cjs');\n"
        "test('keeps prices inside the range', () => {\n"
        "  assert.deepEqual(filterByPrice([{price: 3}, {price: 7}, {price: 12}], 2, 10),\n"
        "    [{price: 3}, {price: 7}]);\n"
        "});\n"
    )
    if case == "verify":
        (path / "boundary.test.cjs").write_text(
            "const {test} = require('node:test');\n"
            "const assert = require('node:assert/strict');\n"
            "const {filterByPrice} = require('./filter.cjs');\n"
            "test('includes the upper boundary', () => {\n"
            "  assert.deepEqual(filterByPrice([{price: 10}], 0, 10), [{price: 10}]);\n"
            "});\n"
        )
    if case == "style-small":
        (path / "index.html").write_text(
            "<!doctype html>\n<html>\n<head><link rel=\"stylesheet\" href=\"styles.css\"></head>\n<body>\n"
            "  <header class=\"bar\">\n"
            "    <svg class=\"icon\" viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" aria-hidden=\"true\">"
            "<path d=\"M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L5.5 20l2-7L2 9h7z\"/></svg>\n"
            "    <h1>Starboard</h1>\n  </header>\n</body>\n</html>\n"
        )
        (path / "styles.css").write_text(
            ".bar { display: flex; gap: 8px; align-items: center; }\n.icon { fill: #555; }\n"
        )
    if case == "resume":
        (path / "completed.cjs").write_text("exports.completed = () => 21;\n")
        (path / "completed.test.cjs").write_text(
            "const {test} = require('node:test');\n"
            "const assert = require('node:assert/strict');\n"
            "const {completed} = require('./completed.cjs');\n"
            "test('completed helper returns its result', () => assert.equal(completed(), 21));\n"
        )
        (path / "docs").mkdir()
        spec = (
            "# Approved utility design\n\nApproved for inline implementation.\n\n"
            "## Task 1: Add completed helper\n\n"
            "**Goal:** Already complete; preserve this task.\n"
            "**Files:** completed.cjs, completed.test.cjs\n"
            "**Interfaces:** Produces completed(), returning 21.\n"
            "**Failing test:** completed() returns 21.\n"
            "**Verify:** node --test completed.test.cjs\n"
            "**Expected:** All tests pass.\n\n"
            "## Task 2: Add clamp utility\n\n"
            "**Goal:** Implement clamp(value, min, max) as a named CommonJS export.\n"
            "Return min below the range, max above it, otherwise the value.\n"
            "All inputs are finite numbers and min <= max.\n"
            "**Files:** clamp.cjs, clamp.test.cjs\n"
            "**Interfaces:** Produces clamp(); consumes no earlier task output.\n"
            "**Failing test:** Assert below, inside, above, equal and negative bounds.\n"
            "**Verify:** npm test\n"
            "**Expected:** All project tests pass.\n\n"
            "## Review Focus\n\nNo UI or dependency changes.\n"
        )
        (path / "docs/spec.md").write_text(spec)
        (path / ".gitignore").write_text(".ryugi/\n")
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    subprocess.run(["git", "-C", str(path), "add", "."], check=True)
    subprocess.run([
        "git", "-C", str(path), "-c", "core.hooksPath=/dev/null",
        "-c", "user.name=Eval", "-c", "user.email=eval@example.invalid",
        "commit", "-qm", "fixture",
    ], check=True)
    if case == "resume":
        workspace = path / ".ryugi/sdd/spec"
        workspace.mkdir(parents=True)
        (workspace / "plan-path").write_text("docs/spec.md\n")
        (workspace / "tasks.md").write_text(spec)
        head = subprocess.check_output(["git", "-C", str(path), "rev-parse", "--short=7", "HEAD"], text=True).strip()
        (workspace / "progress.md").write_text(
            "# SDD ledger — plan: docs/spec.md\n"
            f"Task 1: complete (commits {head}..{head}, tests: node --test completed.test.cjs → pass 1)\n"
        )


def run_one(repo, root, plugin, arm, case, rep, settings, timeout, model, port):
    name = f"{case}-{arm}-{rep}"
    out = root / "runs" / name
    out.mkdir(parents=True)
    project = root / "projects" / name
    make_project(project, case)
    config_dir = root / "configs" / name
    config_dir.mkdir(parents=True)
    env = session_env(os.environ, root / "sessions" / name, port, root / "shims")
    # Each process has a private skill/config directory. Keep the caller's
    # authentication in its environment; never write credentials into evidence.
    env["CLAUDE_CONFIG_DIR"] = str(config_dir)
    env.pop("CLAUDE_CODE_TASK_LIST_ID", None)
    env.pop("CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS", None)
    cmd = [
        "claude", "-p", "--output-format", "stream-json", "--verbose",
        "--model", model,
        "--no-session-persistence", "--setting-sources", "",
        "--settings", str(settings), "--strict-mcp-config",
        "--mcp-config", '{"mcpServers":{}}',
        "--permission-mode", "acceptEdits", "--permission-prompts", "none",
        "--tools", TOOLS, "--allowed-tools", TOOLS,
        "--plugin-dir", str(plugin), "--add-dir", str(plugin),
        "--", CASES[case],
    ]
    start = time.monotonic()
    timed_out = False
    observer_stop = None
    with (out / "raw.jsonl").open("w") as stdout, (out / "stderr.txt").open("w") as stderr:
        proc = subprocess.Popen(cmd, cwd=project, env=env, stdin=subprocess.DEVNULL,
                                stdout=stdout, stderr=stderr, start_new_session=True)
        while proc.poll() is None:
            if case in PROBED_CASES:
                for line in (out / "raw.jsonl").read_text().splitlines():
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if event.get("type") != "assistant":
                        continue
                    for block in event.get("message", {}).get("content", []):
                        if block.get("type") != "tool_use":
                            continue
                        decision = observation_stop(case, block)
                        if decision:
                            observer_stop = decision
                            break
                    if observer_stop:
                        break
            if observer_stop or time.monotonic() - start > timeout:
                timed_out = observer_stop is None
                os.killpg(proc.pid, signal.SIGTERM)
                break
            time.sleep(0.2)
        if proc.poll() is None:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
        code = proc.returncode
    stop_server(plugin, env)
    elapsed = round(time.monotonic() - start, 3)
    events = []
    for line in (out / "raw.jsonl").read_text().splitlines():
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    # Keep observable text, tool requests and results; omit thinking blocks.
    trace, result, init, hooks = [], {}, {}, []
    for event in events:
        kind = event.get("type")
        if kind == "system" and event.get("subtype") == "init":
            init = {k: event.get(k) for k in ("model", "skills", "plugins", "tools", "session_id")}
        if kind == "system" and event.get("subtype") == "hook_response":
            hooks.append({k: event.get(k) for k in ("hook_name", "exit_code", "outcome", "stdout", "stderr")})
        if kind in ("assistant", "user"):
            for block in event.get("message", {}).get("content", []):
                if isinstance(block, dict) and block.get("type") in ("text", "tool_use", "tool_result"):
                    trace.append({"role": kind, **block})
        if kind == "result":
            result = {k: event.get(k) for k in (
                "subtype", "is_error", "result", "num_turns", "usage", "modelUsage", "total_cost_usd",
                "permission_denials", "stop_reason",
            )}
    status = subprocess.run(["git", "status", "--porcelain"], cwd=project, capture_output=True, text=True).stdout
    checks = {}
    artifacts = collect_artifacts(project)
    if case == "style-small":
        styled = "".join(p.read_text(errors="replace") for p in project.rglob("*")
                         if p.is_file() and p.suffix in (".css", ".html") and ".ryugi" not in p.parts)
        checks["recolored"] = bool(re.search(r"cornflowerblue|#6495ed", styled, re.I))
    if case == "resume":
        checks["completed_task_preserved"] = (project / "completed.cjs").read_text() == "exports.completed = () => 21;\n"
    if case in ("bug", "clamp", "direct"):
        checker = (
            "const assert=require('node:assert/strict');"
            "const {filterByPrice:f}=require('./filter.cjs');"
            "assert.deepEqual(f([{price:0},{price:5},{price:10},{price:11}],0,10),"
            "[{price:0},{price:5},{price:10}]);"
        ) if case == "bug" else (
            "const assert=require('node:assert/strict');"
            "const {clamp:c}=require('./clamp.cjs');"
            "for(const [v,a,b,w] of [[-1,0,10,0],[11,0,10,10],[5,0,10,5],[0,0,10,0],"
            "[10,0,10,10],[3,4,4,4],[-5,-10,-2,-5]])assert.equal(c(v,a,b),w);"
        )
        p = subprocess.run(["node", "-e", checker], cwd=project, capture_output=True, text=True)
        checks["behavior_pass"] = p.returncode == 0
        checks["behavior_error"] = p.stderr[-1500:] if p.returncode else ""
    record = {
        "name": name, "arm": arm, "case": case, "rep": rep, "prompt": CASES[case],
        "elapsed_seconds": elapsed, "exit_code": code, "timed_out": timed_out,
        "observer_stop": observer_stop, "hooks": hooks,
        "init": init, "result": result, "trace": trace, "git_status": status, "checks": checks,
        "artifacts": artifacts,
    }
    write_json(out / "record.json", record)
    print(json.dumps({
        "run": name, "seconds": elapsed, "exit": code, "timeout": timed_out,
        "observer_stop": observer_stop["reason"] if observer_stop else None,
        "model": init.get("model"), "turns": result.get("num_turns"),
    }), flush=True)
    return record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--reps", type=int, default=5)
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--model", default="haiku")
    parser.add_argument("--router-file", type=Path)
    parser.add_argument("--baseline-rev", default=BASELINE_REV)
    parser.add_argument("--artifacts-version", default="1.63.0")
    parser.add_argument("--cases", nargs="+", choices=CASES, default=list(BASE_CASES))
    parser.add_argument("--arms", nargs="+", choices=ARMS, default=list(BASE_ARMS))
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    root = args.output or Path(tempfile.mkdtemp(prefix="ryugi-bootstrap-eval-"))
    root.mkdir(parents=True, exist_ok=True)
    settings = root / "settings.json"
    user_settings = json.loads((Path.home() / ".claude/settings.json").read_text())
    # Preserve configured model/effort only; isolate hooks, plugins and skills.
    write_json(settings, {k: user_settings[k] for k in ("model", "effortLevel") if k in user_settings})
    if not (os.environ.get("CLAUDE_CODE_OAUTH_TOKEN") or os.environ.get("ANTHROPIC_API_KEY")):
        parser.error("Supply CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY for the isolated CLI sessions")
    plugins = {arm: make_plugin(repo, root, arm, args.router_file, args.baseline_rev) for arm in args.arms}
    real_cli = install_artifacts(root, args.artifacts_version)
    for plugin in plugins.values():
        write_port_shim(plugin, real_cli)
    write_open_shims(root / "shims")
    source = repo / "skills/using-ryugi/SKILL.md"
    write_json(root / "manifest.json", {
        "repo_head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
        "bootstrap_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "artifacts_version": args.artifacts_version,
        "cli": subprocess.check_output(["claude", "--version"], text=True).strip(),
        "settings": json.loads(settings.read_text()), "cases": CASES, "arms": args.arms,
        "model": args.model,
        "selected_cases": args.cases,
        "arm_bootstraps": {arm: (plugin / "skills/using-ryugi/SKILL.md").read_text()
                           if (plugin / "skills/using-ryugi/SKILL.md").exists() else None
                           for arm, plugin in plugins.items()},
        "baseline_rev": args.baseline_rev,
        "arm_brainstorming": {arm: (plugin / "skills/brainstorming/SKILL.md").read_text()
                              for arm, plugin in plugins.items()},
        "reps": args.reps, "workers": args.workers, "timeout": args.timeout,
    })
    jobs = [(a, c, r) for r in range(1, args.reps + 1) for c in args.cases for a in args.arms]
    random.Random(20261031).shuffle(jobs)
    print(json.dumps({"output": str(root), "runs": len(jobs)}), flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(run_one, repo, root, plugins[a], a, c, r, settings,
                                   CASE_TIMEOUTS.get(c, args.timeout), args.model, 27400 + i)
                   for i, (a, c, r) in enumerate(jobs)]
        records = [future.result() for future in concurrent.futures.as_completed(futures)]
    write_json(root / "records.json", sorted(records, key=lambda x: x["name"]))


if __name__ == "__main__":
    main()
