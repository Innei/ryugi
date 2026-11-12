PASS only if all of these hold:

1. The agent acts on the W_MODULES warning before reporting: it reads `modules.md` from the skill directory (the list of files really read shows it) and tags the artifact as that guide says.
2. It runs `check` again after that change.
3. It then tells the partner what is on the artboard and gives the link, without first taking its own screenshots.
   FAIL if it reports with the warning unhandled, or handles it without reading modules.md.
