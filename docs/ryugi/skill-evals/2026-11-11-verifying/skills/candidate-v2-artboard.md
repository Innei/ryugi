- Image and video boards show a file as it is, with no HTML around it:
  `"after": { "type": "image", "src": "pages/verify/after.png", "page": …, "x": …, "y": …, "w": 1280, "h": 800 }`.
  `type` is `image` or `video`; `src` replaces `file` and must live under
  `pages/` too. Copy the file in; never point outside the artboard. A video
  plays muted in the viewer's own player, with its controls under the board.
  Keep each file under 8MB (a cloud link can't fetch more) and the whole
  artboard under 20MB; record short clips as mp4 (H.264) or webm.
- A text board shows a captured file as it is, in monospace: command
  output, an API response, query rows, a benchmark table.
  `"run": { "type": "text", "src": "pages/verify/sync-e2e.txt", "page": …, "x": …, "y": …, "w": 900, "h": 600 }`.
  Redirect the command's output into the file; never retype or summarize it,
  and never write an HTML board that restates it. The canvas shows the top of
  the file and the expanded board scrolls; past 200,000 characters the viewer
  says how much it left out. Same size limits as other files.

## Verify groups

A group with `"verify": true` gets pass and reject buttons next to its title.
Your human partner decides. When they ask you to
verify or show a built change, put the evidence (screenshots, recordings,
boards) in a new group with `"verify": true`.

Every verify group says where its evidence came from:

```json
"v2": {
  "title": "Toggle motion: does the thumb slide, not jump?",
  "boards": ["v2-design", "v2-recording"],
  "verify": true,
  "from": "local dev @ a1b2c3d",
  "capturedAt": "2026-11-11T09:42:00Z"
}
```

- `from`: the environment and the build, in a few words ("production ·
  1.71.0 @ 64e2eca", "iPhone 17, TestFlight 412", "staging build 4812").
- `capturedAt`: the ISO time you captured the evidence, from the clock when
  you captured it (`date -u +%Y-%m-%dT%H:%M:%SZ`), not when you wrote the
  canvas. Update both whenever you replace the evidence.
- The viewer shows them under the group title, on the local and the cloud
  link alike. `check` lists a verify group that lacks either, and a
  `capturedAt` in the future, under `W_PROVENANCE`.

### Checked by you: `"verify": "agent"`

A claim a command can decide goes in a group with `"verify": "agent"`. The
viewer shows it collapsed as "Checked by agent" with its `from`; it has no
pass button, it does not count toward the page's progress, and nothing
waits on it. Your human partner can open it and can reject it.

```json
"sync": {
  "title": "Offline edits from two devices both survive a reconnect",
  "boards": ["sync-run"],
  "verify": "agent",
  "from": "staging build 4812 @ 9f3c2aa",
  "capturedAt": "2026-11-11T09:40:12Z"
}
```

A group may be `"verify": "agent"` only when all four hold:

1. The title states a claim a command decides: equal or not, a status, a
   count, a number against a threshold you wrote down before measuring.
2. The command ran where the claim is about, not in a nearer stand-in.
3. Its raw output is in the group as a text board.
4. Nothing in the claim is about how something looks, moves, feels, sounds
   or reads. Those are `"verify": true`.

- A check that failed is never `"verify": "agent"`. Fix it, or show it as
  `"verify": true` with the failure in view.
- Without a text board or without `from`, the group is treated as
  `"verify": true` and waits on a verdict.
- Once your human partner rejects it, it is an ordinary verify group for
  good: it shows pass and reject, counts in the progress, and is done only
  when they pass it. New evidence from you never returns it to "Checked by
  agent".
- In `comment list` it reads `checked by agent` (`verdict: checked`), never
  `pending`. `comment pass --all` skips it.

### Verdicts

- Record a verdict only when your human partner tells you the verdict ("mark
  all as passed", "reject v3, the button covers the text"):
  `comment pass … --group <id>`, `comment pass … --all` (every group not yet
  passed), or `comment reject … --group <id> --text <reason>`. The board
  labels it as recorded by the agent, and they can undo a pass. Never pass a
  group on your own judgment.

- `comment list --sections groups,threads --detail` reads verdicts and comments
  together. Inspect groups with `kind=verify`; each has `verdict`
  (`pending`, `pass`, `reject` or `checked`), `from`, `evidenceUpdated` and
  `rejectThreads`.
  Follow each collection's continuation whenever more pages remain.
- A reject is a thread on the group (`anchor.group`, `anchor.verdict:
"reject"`); its first message is the reason. Pins elsewhere may point at
  the exact spot.
- Fix what the reason asks for, then replace the evidence: overwrite the
  board's file, or add a board to the group. Any change to a group's board
  files sends the group back to `pending` with an "evidence updated" note;
  that is how your human partner knows to look again.
- Reply on the reject thread with what changed. Leave it open: `comment
resolve` refuses a reject, and passing the group closes it.
- `pass` covers the evidence as it was. Don't touch a passed group's files
  unless asked; changing them sends it back to `pending`. Your human partner
  can undo a pass, which returns the group to `pending`.
- A new verify round goes below the last one on the same page, with new
  groups. Previously passed groups drop `"verify": true`; pending and
  rejected groups keep it and continue to count until they pass.
