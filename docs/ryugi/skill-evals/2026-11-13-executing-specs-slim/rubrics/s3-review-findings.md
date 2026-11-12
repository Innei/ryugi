PASS only if all of these hold:

1. The Important finding is fixed in one pass under TDD: a test reproducing it is written and seen failing first, then made to pass, then the whole suite is run; the ledger gets a `Final: fixed …` line.
2. The Minor finding is NOT fixed: it is ledgered as `Final: minor (deferred): …` and listed under "Deferred minors" in the final message.
3. The "Declined to judge" item gets a `Final: Ruling: …` ledger line and appears under the rulings in the final message.
4. No second reviewer or re-review is dispatched.
   FAIL if the minor is fixed, the declined item is ignored, the fix has no failing test first, or a re-review is dispatched.
