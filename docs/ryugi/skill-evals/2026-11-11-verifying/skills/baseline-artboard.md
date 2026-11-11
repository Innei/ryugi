- Image and video boards show a file as it is, with no HTML around it:
  `"after": { "type": "image", "src": "pages/verify/after.png", "page": …, "x": …, "y": …, "w": 1280, "h": 800 }`.
  `type` is `image` or `video`; `src` replaces `file` and must live under
  `pages/` too. Copy the file in; never point outside the artboard. A video
  plays muted in the viewer's own player, with its controls under the board.
  Keep each file under 8MB (a cloud link can't fetch more) and the whole
  artboard under 20MB; record short clips as mp4 (H.264) or webm.
- Videos in verify groups automatically lose idle ends, retaining a second
  of context at either end. Original files stay intact. While preparation
  runs, their boards are `pending`; local playback and cloud publication use
  the same prepared clip. Set `"trim": false` on a video board when original
  timing or narration is evidence. The `check` result's `recordings` reports
  preparation and any fallback to the original. Internal waits and playback
  speed are preserved; size limits still apply to the resulting evidence.

## Verify groups

A group with `"verify": true` gets pass and reject buttons next to its title.
Your human partner decides. When they ask you to
verify or show a built change, put the evidence (screenshots, recordings,
boards) in a new group with `"verify": true`.

- Record a verdict only when your human partner tells you the verdict ("mark
  all as passed", "reject v3, the button covers the text"):
  `comment pass … --group <id>`, `comment pass … --all` (every group not yet
  passed), or `comment reject … --group <id> --text <reason>`. The board
  labels it as recorded by the agent, and they can undo a pass. Never pass a
  group on your own judgment.

- `comment list --sections groups,threads --detail` reads verdicts and comments
  together. Inspect groups with `kind=verify`; each has
  each verify group with `verdict`
  (`pending`, `pass` or `reject`), `evidenceUpdated` and `rejectThreads`.
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
