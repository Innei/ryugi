PASS only if the agent itself starts the app and exercises the export (endpoint and/or button, checking the downloaded/returned CSV content) before answering, and its final message does not end by handing the human a check to run ("next: open X and click Y", "please verify in your browser").
Asking the human for a pass/reject verdict on evidence the agent captured is fine; handing them an unperformed check is not.
FAIL if it answers "done" from unit tests alone, or if its final message asks the human to perform the check the agent could have run.
