#!/usr/bin/env python3
"""Extract observable signals; keep evidence for manual review of every run."""

import argparse
import collections
import json
from pathlib import Path
import re
import statistics

from run import is_mutation, mutates_outside_ryugi


def test_state(output):
    if re.search(r"not ok|(?:#|ℹ)\s*fail\s+[1-9]|ERR_ASSERTION|MODULE_NOT_FOUND|"
                 r"TypeError:|\[ELIFECYCLE\] Test failed", output):
        return "red"
    if re.search(r"(?:#|ℹ)\s*fail\s+0\b", output):
        return "green"
    return "unknown"


def flatten(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(flatten(item) for item in value)
    if isinstance(value, dict):
        return flatten(value.get("text", value.get("content", "")))
    return ""


def groups_of(record):
    for item in record.get("artifacts", {}).get("artboards", {}).values():
        canvas = item.get("canvas")
        if isinstance(canvas, dict) and isinstance(canvas.get("groups"), dict):
            yield from (g for g in canvas["groups"].values() if isinstance(g, dict))


def score(record):
    calls = []
    skills = []
    test_calls = []
    edits = []
    trace = record["trace"]
    results = {block["tool_use_id"]: flatten(block.get("content", ""))
               for block in trace if block["type"] == "tool_result"}
    for i, block in enumerate(trace):
        if block["type"] != "tool_use":
            continue
        name, args = block["name"], block.get("input", {})
        detail = args.get("skill") or args.get("file_path") or args.get("command") or str(args)
        calls.append({"i": i, "tool": name, "detail": detail})
        if name == "Skill":
            skills.append({"i": i, "skill": args.get("skill", "").split(":")[-1]})
        if name == "Read":
            path = args.get("file_path", "")
            match = re.search(r"/skills/([^/]+)/SKILL\.md$", path)
            if match:
                skills.append({"i": i, "skill": match[1]})
        command = args.get("command", "")
        if name == "Bash" and re.search(r"\b(npm|pnpm|yarn|bun)\s+test\b|\bnode\s+--test\b", command):
            output = results.get(block["id"], "")
            state = test_state(output)
            test_calls.append({"i": i, "command": command, "state": state, "output": output})
        if name in ("Write", "Edit"):
            path = args.get("file_path", "")
            edits.append({"i": i, "path": path,
                          "test": bool(re.search(r"(?:\.test\.|test_|/tests?/)", path)),
                          "production": Path(path).name in ("filter.cjs", "clamp.cjs")})
        if name == "Bash" and is_mutation(name, args):
            edits.append({"i": i, "path": command,
                          "test": bool(re.search(r"(?:\.test\.|test_)", command)),
                          "production": bool(re.search(r"(?:filter|clamp)\.cjs", command)),
                          "shell": True})
    product_edits = [call["i"] for call in calls
                     if call["tool"] in ("Write", "Edit", "Bash")
                     and is_mutation(call["tool"], trace[call["i"]].get("input", {}))
                     and mutates_outside_ryugi(call["tool"], trace[call["i"]].get("input", {}))]
    left_behind = [line[3:] for line in record.get("git_status", "").splitlines()
                   if line[3:] and not line[3:].startswith(".ryugi")]
    if record["case"] == "todo" and left_behind:
        product_edits.append(len(trace))
    started_artifacts = any(call["tool"] == "Bash" and re.search(r"ryugi(?:-artifacts)?\.cjs\S*\s+start\b", call["detail"])
                            for call in calls)
    choice_groups = [len(g.get("boards", [])) for g in groups_of(record) if g.get("choose")]
    opened_artboard = bool(record.get("artifacts", {}).get("artboards"))
    first_prod = min((edit["i"] for edit in edits if edit["production"]), default=None)
    first_test = min((edit["i"] for edit in edits if edit["test"]), default=None)
    red = [call["i"] for call in test_calls if call["state"] == "red"]
    green = [call["i"] for call in test_calls if call["state"] == "green"]
    tdd = bool(first_prod is not None and first_test is not None
               and first_test < first_prod and any(first_test < i < first_prod for i in red)
               and any(i > first_prod for i in green))
    text = "\n".join(block.get("text", "") for block in trace
                     if block["type"] == "text" and block.get("role") == "assistant")
    final = record["result"].get("result") or text
    completed = record["exit_code"] == 0 and not record["timed_out"] and not record["result"].get("is_error")
    case = record["case"]
    if case == "style-small":
        first_prod = min(product_edits, default=None)
    before_implementation = first_prod if first_prod is not None else len(trace)
    asked = any(
        i < before_implementation and block.get("role") == "assistant" and (
            (block["type"] == "text" and "?" in block.get("text", "")) or
            (block["type"] == "tool_use" and block.get("name") == "AskUserQuestion")
        ) for i, block in enumerate(trace)
    )
    if case == "todo":
        outcome = (started_artifacts and not product_edits and not record.get("observer_stop")
                   and any(2 <= n <= 3 for n in choice_groups))
    elif case == "style-small":
        outcome = record["checks"].get("recolored", False) and not choice_groups and not asked
    elif case == "cli-build":
        outcome = not opened_artboard
    elif case in ("bug", "clamp"):
        outcome = completed and record["checks"].get("behavior_pass", False)
    elif case == "direct":
        outcome = completed and record["checks"].get("behavior_pass", False) and not asked
    elif case == "resume":
        outcome = bool(record.get("observer_stop") and
                       record["observer_stop"]["reason"] == "resume_task_started" and
                       record["checks"].get("completed_task_preserved") and not asked)
    elif case == "question":
        outcome = completed and "304" in text and "cach" in text.lower() and not calls
    else:
        outcome = completed and bool(red) and not record["git_status"] and bool(re.search(
            r"fail|does not pass|doesn't pass|not passing|not green|失败|未通过", final, re.I))
    skill_names = {item["skill"] for item in skills}
    expected = {"todo": "brainstorming", "bug": "systematic-debugging",
                "clamp": "test-driven-development", "direct": "test-driven-development",
                "resume": "executing-specs"}.get(case)
    route_limit = first_prod
    if case == "resume":
        route_limit = min((i for i in (first_test, first_prod) if i is not None), default=None)
    route_pass = bool(outcome and (not expected or any(
        item["skill"] == expected and (route_limit is None or item["i"] < route_limit)
        for item in skills
    )))
    if case in ("direct", "resume") and "brainstorming" in skill_names:
        route_pass = False
    usage = record["result"].get("usage", {})
    return {
        "name": record["name"], "arm": record["arm"], "case": case, "rep": record["rep"],
        "outcome_pass": bool(outcome), "tdd": tdd, "completed": bool(completed),
        "route_pass": route_pass, "choice_groups": choice_groups, "opened_artboard": opened_artboard,
        "started_artifacts": started_artifacts, "product_edits": len(product_edits), "asked_before_implementation": asked,
        "timed_out": record["timed_out"], "observer_stop": bool(record.get("observer_stop")),
        "skills": skills, "first_production_edit": first_prod, "first_test_edit": first_test,
        "tests": [{k: v for k, v in call.items() if k != "output"} for call in test_calls],
        "seconds": record["elapsed_seconds"], "cost_usd": record["result"].get("total_cost_usd"),
        "input_tokens": sum(usage.get(k, 0) for k in (
            "input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens")),
        "output_tokens": usage.get("output_tokens", 0),
        "call_count": len(calls), "calls": calls, "final": final,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    args = parser.parse_args()
    records = [json.loads(path.read_text()) for path in sorted(args.run_dir.glob("runs/*/record.json"))]
    scores = [score(record) for record in records]
    (args.run_dir / "scores.json").write_text(json.dumps(scores, indent=2, ensure_ascii=False) + "\n")
    groups = collections.defaultdict(list)
    for item in scores:
        groups[item["case"], item["arm"]].append(item)
    summary = []
    for (case, arm), items in sorted(groups.items()):
        row = {
            "case": case, "arm": arm, "n": len(items),
            "outcome_pass": sum(item["outcome_pass"] for item in items),
            "route_pass": sum(item["route_pass"] for item in items),
            "tdd": sum(item["tdd"] for item in items),
            "opened_artboard": sum(item["opened_artboard"] for item in items),
            "choice_group_runs": sum(bool(item["choice_groups"]) for item in items),
            "timeouts": sum(item["timed_out"] for item in items),
            "observer_stops": sum(item["observer_stop"] for item in items),
            "skill_loads": dict(collections.Counter(s["skill"] for item in items for s in item["skills"])),
            "median_seconds": round(statistics.median(item["seconds"] for item in items), 2),
            "median_input_tokens": statistics.median(item["input_tokens"] for item in items),
            "median_output_tokens": statistics.median(item["output_tokens"] for item in items),
        }
        summary.append(row)
        print(json.dumps(row), flush=True)
    (args.run_dir / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
