# Python ownership replay — September 14, 2026

## Result

**The captured-page ownership error is cleared; the Tutorial flow is not yet
complete.** The single newly authorized replay runs from
`2026-09-14T04:13:57.727Z` to `2026-09-14T04:13:58.986Z`.

The native browser discovers the original Tutorial link (`e375`) and attempts
the real session click. Unlike the preceding replay, it reaches the request for
`https://docs.python.org/3/tutorial/index.html`. That response is not among this
experiment's eight captured resources, so the fixture guard rejects it with
`Uncaptured request denied before transport`.

This is our offline allowlist, not a Python-site block, login wall or CAPTCHA.
There is no returned click result and no completed destination navigation.
`flowPassed` remains false; `observationComplete` is true. Reaching the denied
destination request is narrower evidence of action progress, not whole-flow
acceptance. The original document remains alive until normal cleanup.

| Observation | Result |
| --- | --- |
| Previous ownership failure | Absent |
| Accepted original resources | 8; 72,064 decoded bytes |
| Adapter attempts | 9: eight accepted, one destination denied before transport |
| Wire requests | 0 |
| Native workload | One homepage navigation, one discovered click, two queries, one formatting observation |
| Overflow diagnostic | Remains zero |
| Other formatting issues | Unchanged: float 8, display 9, clear 3; total 20 |
| Formatting metrics | Unchanged: 576 visited DOM nodes, 669 boxes, 4,074 text units, work 8,968, 9 deferred subtrees |

The 1.259-second observation now includes a click that progresses further than
the previous early failure. It is not a normalized speed comparison. Unchanged
formatting metrics do not prove unchanged total layout, image or click cost.

## Build And Integrity

The replay uses only
`node_modules/.cache/native-validation/overflow-ownership-work-september14/release01/snapshot01/dist`,
bound to correction commit `23e988d39d721c27a318c4d129e1736f32118c48` and gate base
`d46fff7ba25add1368bb841cb11e5ffd527701df`. It does not use root `dist` or the later
nested-actionability capability build.

That pinned gate records 22,065 passing tests, zero failures and two unchanged
exclusions; 437 selected files, 436 strict roots, 789 manifest entries, 1,342
source files and 2,172 compiled files. Parent verification compares all 1,334
tracked source/script TypeScript files against the correction commit. The six
workload/guard files and original resource bytes remain unchanged.

All 18 run ledgers (10,947 entries) verify. The child exits zero, its handle is
reaped and process group `1261783` is independently confirmed absent again.
Private HOME/TMP directories are empty and removed; session tabs, active queues,
retained document nodes and transport work are closed. No cleanup or guard
attempt errors occur. Verification success does not change `flowPassed:false`.

Evidence is retained under `node_modules/.cache/native-validation/`:

- `native-python-ownership-september14/before-RESULT.json` SHA256:
  `b03f9c07663bed847a3cd1bcd49b035496e44b705a22357d00319b6d7469b1ba`.
- `native-python-ownership-september14/VERIFICATION.json` SHA256:
  `306bfa66f22265d1eb765fc83796700e523c49ba5ace4b2558a09fc42ae3a562`.
- `native-python-ownership-september14/EVIDENCE.sha256`, 49 entries, SHA256:
  `a15072c6558b377b31042892963f08cf17c4371479a08481d9ed7e3adc1bbd2e`.
- `python-ownership-replay-work-september14/preparation/REPLAY-EVIDENCE.sha256`,
  18 entries, SHA256:
  `720e0f4cb716614d0447be333001ca33bd3b627af783ad90d4cb74a1d054e5d6`.
- `python-ownership-replay-work-september14/PARENT-OUTCOME-VERIFICATION.json`
  records the independent sealed-result and current process-group checks.

## Next Acceptance Gate

A separate two-page experiment can use the Tutorial response already captured
on September 13, documented in `PYTHON-TUTORIAL-NATIVE-CHECK-SEPTEMBER-13.md`.
It must explicitly declare that added response and exact allowed assets, then
follow the discovered link rather than navigate directly. Unknown requests must
still stop. This would be an expanded corpus, not a retry or relabeling of the
unchanged eight-resource comparison.

No such expansion occurs here. Historical V2 and sticky results remain intact.
Live-site rendering, complete navigation, repeatable performance, research,
credential/passkey/device, SafeJS, socket, TTY and challenge-handling gates remain
open. See `PYTHON-OVERFLOW-REPLAY.md` for the preceding failure and synthetic fix.
