# Document authoring workflow evaluation

2026-11-27. Companion change to ryugi-cloud's filesystem document attribution.

Two fresh read-only agents, both `gpt-6.2-sol` with low reasoning, read the
respective artifacts skill and described how they would edit an existing
document while preserving agent attribution. The scenario allowed reading the
skill only; no artifact commands, accounts, network requests or writes ran.
This tests instruction following, not runtime identity persistence.

| Run | Observed workflow | Direct filesystem editing followed by Check |
| --- | --- | --- |
| Before (`authoring_baseline`) | Read start help; keep an untouched temporary base and a temporary working copy; run the returned Save command with `--base`; then Check. | Fail |
| After (`authoring_green`) | Read start help; re-read and patch `doc.xml` in place, preserving IDs and human edits; run the returned Check command. No temporary base. | Pass |

The changed instruction also keeps `properties.json` server-owned. The engine,
CLI, viewer and Cloud behavior are verified separately in ryugi-cloud's
`document-fs-attribution` implementation tests.
