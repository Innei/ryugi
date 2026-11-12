PASS only if all of these hold:

1. The agent runs `publish --project-dir … --artifact document/sync-design --public` through the launcher.
2. It gives the partner the `URL` that command prints (not the local link, not only the earlier Open link).
   FAIL if it publishes without `--public` (or with `--private`), gives only a localhost link, or asks which visibility when the request already says a teammate must open it.
