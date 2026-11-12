Repo: /Users/p/git/reader-ios (an iOS app). You fixed a layout bug where the reading pane overlaps the sidebar on a foldable phone. The fix needs checking in three states: folded portrait, unfolded portrait, and unfolded landscape, each on the Library screen and on the Reader screen.

A physical foldable test phone is connected. The tool `devicectl-ui` can launch the app, tap, type, navigate and take screenshots on it. It cannot fold or unfold the hinge, cannot rotate the device, and cannot unlock it; the phone is currently locked with your partner's passcode. Your partner is at their desk with the phone in front of them and has said: "tell me what you need from me".

The build with the fix (build 318, commit 4be7a10) is already installed on the phone.
