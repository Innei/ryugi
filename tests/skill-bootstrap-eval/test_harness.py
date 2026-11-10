import os
import subprocess
import tempfile
import unittest
from pathlib import Path

import run as harness

from run import is_mutation
from score import score, test_state


class ObservationTests(unittest.TestCase):
    def test_read_commands_with_stderr_redirect_do_not_stop_the_agent(self):
        self.assertFalse(is_mutation("Bash", {"command": "ls -la && cat package.json 2>/dev/null; git log --oneline | head -5"}))

    def test_redirecting_diagnostics_to_null_is_read_only(self):
        self.assertFalse(is_mutation("Bash", {"command": "echo ready >/dev/null"}))

    def test_spaced_diagnostic_redirect_is_read_only(self):
        self.assertFalse(is_mutation("Bash", {"command": "echo ready > /dev/null"}))

    def test_scaffolding_through_npx_is_observed(self):
        self.assertTrue(is_mutation("Bash", {"command": "npx --yes create-vite@latest todo-app --template react"}))

    def test_resume_bookkeeping_does_not_end_the_probe(self):
        self.assertIsNone(harness.observation_stop("resume", {
            "name": "Write", "input": {"file_path": "/project/.ryugi/sdd/spec/progress.md"},
        }))

    def test_resume_starts_when_the_remaining_tasks_test_is_written(self):
        stop = harness.observation_stop("resume", {
            "name": "Write", "input": {"file_path": "/project/clamp.test.cjs"},
        })
        self.assertEqual(stop["reason"], "resume_task_started")

    def test_resume_detects_rewriting_a_completed_task(self):
        stop = harness.observation_stop("resume", {
            "name": "Edit", "input": {"file_path": "/project/completed.cjs"},
        })
        self.assertEqual(stop["reason"], "completed_task_mutation")

    def test_starting_a_scaffold_stops_startup_observation(self):
        self.assertTrue(is_mutation("Bash", {"command": "mkdir -p todo-app/src && npm install"}))

    def test_writing_source_through_shell_stops_observation(self):
        self.assertTrue(is_mutation("Bash", {"command": "cat > App.jsx <<'EOF'\nexport default App;\nEOF"}))

    def test_file_tool_writes_stop_observation(self):
        self.assertTrue(is_mutation("Write", {"file_path": "App.jsx", "content": ""}))

    def test_node_spec_reporter_failure_is_red(self):
        self.assertEqual(test_state("✖ includes maximum\nℹ pass 1\nℹ fail 1"), "red")

    def test_node_spec_reporter_success_is_green(self):
        self.assertEqual(test_state("✔ includes maximum\nℹ pass 2\nℹ fail 0"), "green")

    def test_truncated_boundary_assertion_is_still_red(self):
        self.assertEqual(test_state("generatedMessage: true, code: 'ERR_ASSERTION', actual: []"), "red")

    def test_truncated_missing_export_failure_is_red(self):
        self.assertEqual(test_state("TypeError: clamp is not a function\n[ELIFECYCLE] Test failed."), "red")

    def test_observer_stop_after_resuming_task_two_is_a_successful_boundary(self):
        record = {
            "name": "resume-short-1", "arm": "short", "case": "resume", "rep": 1,
            "exit_code": 143, "timed_out": False, "result": {}, "elapsed_seconds": 1,
            "git_status": "?? clamp.test.cjs\n", "checks": {"completed_task_preserved": True},
            "observer_stop": {"reason": "resume_task_started"},
            "trace": [
                {"role": "assistant", "type": "tool_use", "name": "Skill", "id": "s",
                 "input": {"skill": "ryugi:executing-specs"}},
                {"role": "assistant", "type": "tool_use", "name": "Write", "id": "w",
                 "input": {"file_path": "/project/clamp.test.cjs"}},
            ],
        }
        result = score(record)
        self.assertTrue(result["outcome_pass"])
        self.assertTrue(result["route_pass"])

    def test_explicit_direct_request_is_not_satisfied_by_a_design_question(self):
        record = {
            "name": "direct-short-1", "arm": "short", "case": "direct", "rep": 1,
            "exit_code": 0, "timed_out": False, "result": {}, "elapsed_seconds": 1,
            "git_status": "", "checks": {"behavior_pass": True}, "observer_stop": None,
            "trace": [{"role": "assistant", "type": "text", "text": "Who is this utility for?"}],
        }
        self.assertFalse(score(record)["outcome_pass"])



REPO = Path(__file__).resolve().parents[2]
REV = "984c6891"


def at_rev(path):
    return subprocess.check_output(["git", "show", f"{REV}:{path}"], cwd=REPO, text=True)


class ArmTests(unittest.TestCase):
    def plugin(self, arm):
        root = Path(tempfile.mkdtemp(prefix="arm-test-"))
        return harness.make_plugin(REPO, root, arm, baseline_rev=REV)

    def test_bs_only_pairs_the_frozen_router_with_the_working_brainstorming(self):
        plugin = self.plugin("bs-only")
        self.assertEqual((plugin / "skills/using-ryugi/SKILL.md").read_text(), at_rev("skills/using-ryugi/SKILL.md"))
        self.assertEqual((plugin / "skills/brainstorming/SKILL.md").read_text(),
                         (REPO / "skills/brainstorming/SKILL.md").read_text())

    def test_baseline_freezes_both_skills(self):
        plugin = self.plugin("baseline")
        self.assertEqual((plugin / "skills/using-ryugi/SKILL.md").read_text(), at_rev("skills/using-ryugi/SKILL.md"))
        self.assertEqual((plugin / "skills/brainstorming/SKILL.md").read_text(), at_rev("skills/brainstorming/SKILL.md"))

    def test_candidate_uses_the_working_tree(self):
        plugin = self.plugin("candidate")
        self.assertEqual((plugin / "skills/using-ryugi/SKILL.md").read_text(),
                         (REPO / "skills/using-ryugi/SKILL.md").read_text())

    def test_injected_arms_get_the_session_start_hook(self):
        for arm in ("baseline", "bs-only", "candidate"):
            self.assertTrue((self.plugin(arm) / "hooks/hooks.json").exists(), arm)



class IsolationTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix="iso-test-"))

    def test_session_env_keeps_server_state_inside_the_session(self):
        env = harness.session_env({"PATH": "/usr/bin"}, self.root / "s", 27401, self.root / "shims")
        self.assertTrue(env["RYUGI_SERVER_HOME"].startswith(str(self.root / "s")))
        self.assertTrue(env["RYUGI_RUNTIME_DIR"].startswith(str(self.root / "s")))
        self.assertEqual(env["PATH"].split(":")[0], str(self.root / "shims"))
        self.assertEqual(env["RYUGI_EVAL_PORT"], "27401")

    def test_session_env_hides_the_partners_cloud_sign_in(self):
        env = harness.session_env({"PATH": "/usr/bin"}, self.root / "s", 27401, self.root / "shims")
        self.assertTrue(env["XDG_CONFIG_HOME"].startswith(str(self.root / "s")))

    def test_open_shims_do_nothing(self):
        harness.write_open_shims(self.root / "shims")
        result = subprocess.run([str(self.root / "shims/open"), "http://localhost:1"], capture_output=True)
        self.assertEqual(result.returncode, 0)

    def shim_argv(self, *args):
        fake = self.root / "fake-cli.cjs"
        fake.write_text("process.stdout.write(JSON.stringify(process.argv.slice(2)))")
        plugin = self.root / "plugin"
        (plugin / "skills/artifacts/app").mkdir(parents=True, exist_ok=True)
        harness.write_port_shim(plugin, fake)
        out = subprocess.check_output(["node", str(plugin / "skills/artifacts/app/cli.cjs"), *args],
                                      env={**os.environ, "RYUGI_EVAL_PORT": "27402"},
                                      text=True)
        import json
        return json.loads(out)

    def test_port_shim_pins_start_to_the_session_port_without_a_browser(self):
        argv = self.shim_argv("start", "--background", "--open", "--project-dir", "/p")
        self.assertEqual(argv[:2], ["start", "--background"])
        self.assertIn("--no-open", argv)
        self.assertNotIn("--open", argv)
        self.assertEqual(argv[argv.index("--port") + 1], "27402")

    def test_port_shim_overrides_an_explicit_port(self):
        argv = self.shim_argv("start", "--port", "27319")
        self.assertEqual(argv.count("--port"), 1)
        self.assertEqual(argv[argv.index("--port") + 1], "27402")

    def test_port_shim_passes_other_commands_through(self):
        self.assertEqual(self.shim_argv("check", "--artifact", "artboard/x"), ["check", "--artifact", "artboard/x"])



class ScenarioObservationTests(unittest.TestCase):
    def stop(self, case, name, **args):
        return harness.observation_stop(case, {"name": name, "input": args})

    def test_writing_an_artboard_does_not_end_the_todo_probe(self):
        self.assertIsNone(self.stop("todo", "Write", file_path="/p/.ryugi/artifacts/artboard/todo/canvas.json"))

    def test_making_the_artboard_directory_does_not_end_the_todo_probe(self):
        self.assertIsNone(self.stop("todo", "Bash", command="mkdir -p .ryugi/artifacts/artboard/todo/pages"))

    def test_heredoc_into_the_artboard_does_not_end_the_todo_probe(self):
        self.assertIsNone(self.stop("todo", "Bash",
                                    command="cat > .ryugi/artifacts/artboard/t/canvas.json <<'EOF'\n{\"a\": 1}; mkdir x\nEOF"))

    def test_product_source_still_ends_the_todo_probe(self):
        self.assertEqual(self.stop("todo", "Write", file_path="/p/src/App.jsx")["reason"], "first_project_mutation")

    def test_a_command_that_also_installs_still_ends_the_todo_probe(self):
        self.assertIsNotNone(self.stop("todo", "Bash", command="mkdir -p .ryugi/x && npm install react"))

    def test_cli_build_ends_at_its_first_source_write(self):
        self.assertIsNotNone(self.stop("cli-build", "Write", file_path="/p/csv.cjs"))

    def test_cli_build_may_open_a_document(self):
        self.assertIsNone(self.stop("cli-build", "Write", file_path="/p/.ryugi/artifacts/document/csv/doc.xml"))

    def test_style_fixture_has_an_icon_to_recolor(self):
        project = Path(tempfile.mkdtemp(prefix="style-")) / "p"
        harness.make_project(project, "style-small")
        self.assertIn("<svg", (project / "index.html").read_text())

    def test_new_cases_have_prompts_and_longer_timeouts(self):
        for case in ("style-small", "cli-build"):
            self.assertIn(case, harness.CASES)
        self.assertGreater(harness.CASE_TIMEOUTS["todo"], 300)


class ArtifactCollectionTests(unittest.TestCase):
    def test_collects_artboard_canvases_and_documents(self):
        project = Path(tempfile.mkdtemp(prefix="collect-"))
        board = project / ".ryugi/artifacts/artboard/todo"
        (board / "pages").mkdir(parents=True)
        (board / "canvas.json").write_text('{"groups": {"q1": {"choose": true, "boards": ["a", "b"]}}}')
        (board / "pages/a.html").write_text("<p>a</p>")
        (project / ".ryugi/artifacts/document/csv").mkdir(parents=True)
        found = harness.collect_artifacts(project)
        self.assertEqual(found["artboards"]["todo"]["canvas"]["groups"]["q1"]["boards"], ["a", "b"])
        self.assertEqual(found["documents"], ["csv"])

    def test_malformed_canvas_is_recorded_as_none(self):
        project = Path(tempfile.mkdtemp(prefix="collect-"))
        board = project / ".ryugi/artifacts/artboard/todo"
        board.mkdir(parents=True)
        (board / "canvas.json").write_text("{not json")
        self.assertIsNone(harness.collect_artifacts(project)["artboards"]["todo"]["canvas"])



def record(case, trace, artboards=None, checks=None, observer_stop=None):
    return {
        "name": f"{case}-candidate-1", "arm": "candidate", "case": case, "rep": 1,
        "exit_code": 0, "timed_out": False, "result": {}, "elapsed_seconds": 1, "git_status": "",
        "checks": checks or {}, "observer_stop": observer_stop, "trace": trace,
        "artifacts": {"artboards": artboards or {}, "documents": [], "html": []},
    }


START = {"role": "assistant", "type": "tool_use", "name": "Bash", "id": "b",
         "input": {"command": "node /x/skills/artifacts/app/ryugi.cjs start --background --artifact artboard/todo"}}
CANVAS = {"role": "assistant", "type": "tool_use", "name": "Write", "id": "w",
          "input": {"file_path": "/p/.ryugi/artifacts/artboard/todo/canvas.json"}}


def board(*groups):
    return {"todo": {"canvas": {"groups": {f"q{i}": g for i, g in enumerate(groups)}}, "files": []}}


class NewOutcomeTests(unittest.TestCase):
    def test_todo_passes_with_a_three_way_choice_and_no_source(self):
        result = score(record("todo", [START, CANVAS], board({"choose": True, "boards": ["a", "b", "c"]})))
        self.assertTrue(result["outcome_pass"])
        self.assertEqual(result["choice_groups"], [3])

    def test_todo_fails_once_product_source_is_written(self):
        app = {"role": "assistant", "type": "tool_use", "name": "Write", "id": "a", "input": {"file_path": "/p/src/App.jsx"}}
        rec = record("todo", [START, CANVAS, app], board({"choose": True, "boards": ["a", "b", "c"]}),
                     observer_stop={"reason": "first_project_mutation"})
        self.assertFalse(score(rec)["outcome_pass"])

    def test_todo_fails_with_a_single_board(self):
        self.assertFalse(score(record("todo", [START, CANVAS], board({"choose": True, "boards": ["a"]})))["outcome_pass"])

    def test_todo_fails_without_starting_artifacts(self):
        self.assertFalse(score(record("todo", [CANVAS], board({"choose": True, "boards": ["a", "b"]})))["outcome_pass"])

    def test_todo_fails_with_a_malformed_canvas(self):
        self.assertFalse(score(record("todo", [START, CANVAS], {"todo": {"canvas": None, "files": []}}))["outcome_pass"])

    def test_style_small_passes_with_a_verify_group_only(self):
        edit = {"role": "assistant", "type": "tool_use", "name": "Edit", "id": "e", "input": {"file_path": "/p/styles.css"}}
        rec = record("style-small", [edit, START], board({"verify": True, "boards": ["after"]}), {"recolored": True})
        self.assertTrue(score(rec)["outcome_pass"])

    def test_style_small_fails_with_a_direction_choice(self):
        rec = record("style-small", [START], board({"choose": True, "boards": ["a", "b"]}), {"recolored": True})
        self.assertFalse(score(rec)["outcome_pass"])

    def test_style_small_fails_when_it_asks_before_editing(self):
        ask = {"role": "assistant", "type": "text", "text": "Which icon do you mean?"}
        edit = {"role": "assistant", "type": "tool_use", "name": "Edit", "id": "e", "input": {"file_path": "/p/styles.css"}}
        self.assertFalse(score(record("style-small", [ask, edit], checks={"recolored": True}))["outcome_pass"])

    def test_cli_build_fails_with_any_artboard(self):
        rec = record("cli-build", [START], {"csv": {"canvas": {"groups": {}}, "files": []}})
        self.assertFalse(score(rec)["outcome_pass"])
        self.assertTrue(score(rec)["opened_artboard"])

    def test_cli_build_passes_with_a_question(self):
        rec = record("cli-build", [{"role": "assistant", "type": "text", "text": "Which delimiter?"}])
        self.assertTrue(score(rec)["outcome_pass"])



class MixedCommandTests(unittest.TestCase):
    def stops(self, command):
        return harness.observation_stop("todo", {"name": "Bash", "input": {"command": command}}) is not None

    def test_scaffold_after_a_canvas_heredoc_stops(self):
        self.assertTrue(self.stops("cat > .ryugi/a/canvas.json <<'EOF'\n{}\nEOF\nnpm create vite@latest app"))

    def test_source_write_after_a_canvas_heredoc_stops(self):
        self.assertTrue(self.stops("cat > .ryugi/a/canvas.json <<EOF\n{}\nEOF\necho x > src/App.jsx"))

    def test_mkdir_of_ryugi_and_source_dirs_stops(self):
        self.assertTrue(self.stops("mkdir -p .ryugi/artifacts/artboard/t src/components"))

    def test_copying_a_board_into_source_stops(self):
        self.assertTrue(self.stops("cp .ryugi/artifacts/artboard/t/a.html src/index.html"))

    def test_heredoc_redirected_into_source_stops(self):
        self.assertTrue(self.stops("cat <<'EOF' > src/App.jsx\nexport default 1\nEOF"))

    def test_short_npm_install_stops(self):
        self.assertTrue(self.stops("npm i react"))

    def test_canvas_heredoc_alone_does_not_stop(self):
        self.assertFalse(self.stops("cat > .ryugi/a/canvas.json <<'EOF'\n{\"x\": \"a > b; mkdir y\"}\nEOF"))

    def test_arrow_functions_in_node_eval_are_not_writes(self):
        self.assertFalse(is_mutation("Bash", {"command": "node -e \"[1].map(x => x >= 0)\""}))

    def test_untracked_source_left_behind_fails_todo(self):
        rec = record("todo", [START, CANVAS], board({"choose": True, "boards": ["a", "b", "c"]}))
        rec["git_status"] = "?? .ryugi/\n?? src/\n"
        self.assertFalse(score(rec)["outcome_pass"])

    def test_only_ryugi_left_behind_keeps_todo_passing(self):
        rec = record("todo", [START, CANVAS], board({"choose": True, "boards": ["a", "b", "c"]}))
        rec["git_status"] = "?? .ryugi/\n"
        self.assertTrue(score(rec)["outcome_pass"])


if __name__ == "__main__":
    unittest.main()
