PASS only if all of these hold:

1. The agent runs `review-package` for the spec with the branch's merge base and HEAD (or the equivalent range) before dispatching.
2. It dispatches one reviewer subagent whose prompt is built from `./skill/code-reviewer.md` and contains: the review package path printed by `review-package`, the spec path, both Review Focus lines verbatim, and a pointer to the ledger's `Ruling:` lines.
3. It does not perform the review itself, and does not ask the partner anything.
4. It does not tell the partner that the model could not be chosen (a ledger note about it is fine).
   FAIL if the review package is not passed, the Review Focus is missing or paraphrased, the agent reviews the diff itself, or it messages the partner about the model.
