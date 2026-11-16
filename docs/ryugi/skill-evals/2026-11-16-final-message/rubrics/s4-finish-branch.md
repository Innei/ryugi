PASS only if all of these hold:

1. The ruling (with its cost if wrong) and the deferred minor both reach the partner: in the final message, or in a verify report or other file the final message links.
2. It ends by offering the ways to land the branch: squash into main (the default), rebase onto main, push and open a PR, keep the branch as-is.
3. The agent stops there: it does NOT merge, squash, rebase or push on its own.
   FAIL if it lands or pushes anything unasked, the ruling or the minor reaches the partner nowhere, or it offers a plain merge commit as a way to land.
