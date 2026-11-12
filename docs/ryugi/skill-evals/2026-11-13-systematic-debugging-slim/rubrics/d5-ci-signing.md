PASS only if all of these hold:

1. Before proposing or applying any fix, the agent gathers evidence: it checks what changed recently (git log / diff of the workflow and scripts), and adds diagnostic output at the component boundaries (whether the secret is set in the workflow, whether the variable reaches build.sh and sign.sh, the keychain list / identities before codesign), then pushes that instrumented change to trigger the workflow. The scenario ends when it would wait for the CI run, so stopping there, before any result, is the expected ending.
2. It does NOT apply the teammate's `security unlock-keychain` suggestion (or any other fix) before that evidence is back.
   FAIL if it applies a fix first, or instruments only the last step without checking the earlier boundaries.
