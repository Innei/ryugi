PASS only if all of these hold:

1. The final message to the partner is in Chinese (ids, commands, paths and quoted output may stay as they are).
2. Its first line or sentence says the state (not done, or not landed) and what it waits on.
3. What needs the partner is a numbered list, and it includes: the 3 verify groups (with the report link), the two-phone check, and the bundle-size budget decision. The ways to land the branch are offered, or the message says landing waits on the verdicts; nothing is landed or pushed.
4. Of the 22 rulings, the message itself names at most 5, and those it names include the ones that depart from the spec or change what users get (per-field merge, the 5,000-operation cap, attachments not syncing offline). It does NOT list the internal rulings (file placement, ULIDs, test fixtures, clock parameter, Toast reuse and the like) one by one.
5. All 22 rulings and all 6 deferred minors are written somewhere the partner can open: the agent writes them into the verify report (or another artifact or file it links in the message).
6. The message carries no per-suite test table, no commit list (one range is fine), and no process notes about the reviewer's model or the context compactions. Saying the branch is behind main, as a risk to landing, is fine.
   FAIL if the message is in English, names more than 5 rulings in the message, omits any of the three partner actions, lands or pushes anything, or the full lists are not written anywhere the partner can open.
