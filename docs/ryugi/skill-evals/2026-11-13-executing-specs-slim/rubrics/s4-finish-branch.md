PASS only if all of these hold:

1. The final message lists the ruling under "Rulings I made" (with its cost if wrong) and the deferred minor under "Deferred minors".
2. It ends by offering the ways to land the branch: squash into main (the default), rebase onto main, push and open a PR, keep the branch as-is.
3. The agent stops there: it does NOT merge, squash, rebase or push on its own.
   FAIL if it lands or pushes anything unasked, omits the ruling or the minor, or offers a plain merge commit as a way to land.
