import unittest

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


if __name__ == "__main__":
    unittest.main()
