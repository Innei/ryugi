# Ryugi Cloud

Commands run through the launcher, as in SKILL.md: resolve `app/` in this
skill's directory to its absolute path.

## Read a Ryugi Cloud link

When your human partner pastes a Ryugi Cloud link (`https://ryugi.innei.dev/a/<id>`,
or `/a/<id>` on another Ryugi Cloud host), run this with `app/` in this skill's directory:

```bash
node app/ryugi.cjs get <link>
```

The page is an app shell; `get` reads its content with this machine's Cloud
sign-in and prints an outline, not the files. Follow the printed `Details`
or `More` command; they keep the captured version and page scope. `--block ID`
reads one complete block, `get <link> --source` prints pure LiteXML, and
files need `--download --out NEW_DIRECTORY`. Exit code 2 requires human
action: follow the printed login or upgrade link.

## Share a link

Publish when they want a link that works outside this machine. The server must
be running.

```bash
node app/ryugi.cjs publish --project-dir /path/to/project --artifact html/arrow-tuner --public
# Publish: PUBLISHED · html/arrow-tuner
# ID: …
# URL: https://ryugi.innei.dev/a/…
# Visibility: public (requested)
```

- First publication: use `--public` for someone else to open it; use `--private`
  for only the signed-in owner.
- To update the same publication, omit both visibility flags. Explicit flags
  change access only when your human partner requests that change.
- Share the printed `URL`. Publishing again replaces what the same link shows.
- Publishing also publishes what the artifact references, following references
  of references: everything never published goes out at the same visibility,
  and everything already published but changed here is updated. `References`
  lists each one with its state. A private one stays private and visitors see
  a locked label; its `Next` line is the command that makes it public, for
  your human partner to decide. `--no-refs` publishes only this artifact.
- Exit code 2 with `E_LOGIN_REQUIRED`: give them the printed login link, wait for
  sign-in, then retry. `E_PLAN_LIMIT` gives the reason and an upgrade link.
- Exit code 1: fix the reported cause. Exit code 5: inspect the retained URL and
  per-target effects before retrying a partial publication.
- `--unpublish` deletes the Cloud copy, `--list` shows a bounded account page,
  and `--delete <cloud-id>` removes the named copy.

## Auto-publish

When your human partner is signed in and auto-publish is on, every artifact
changed during your turn is published as a private copy when the turn ends
(Claude Code only; elsewhere, publish when asked). `config` prints
whether it is on.

- Do not run `publish` to keep a private copy current; the turn end does it.
- They want to look from their phone or another machine: give them
  the `Open` URL from `start`. It is live while this computer is on, and shows
  the last published copy when it is off. Or ryugi.innei.dev, which lists
  every copy once they sign in there.
- Someone else will open it: `--public`, as in Share a link.
- An unpublished artifact stays out of auto-publish until it is published by
  hand.
- When asked to put the auto-publish question to them, ask once and run
  `config --auto-publish on` or `off` with their answer. Their project-only
  choice: add `--project`.
