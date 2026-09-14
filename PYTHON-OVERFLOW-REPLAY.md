# Python overflow replay — September 14, 2026

## Outcome

The single explicitly authorized V2 original-resource native replay completed on
September 14, 2026. The observation ran from `03:43:00.301Z` to
`03:43:00.575Z`. **Integrity verification passed; the Tutorial flow failed.**

| Observation | Result |
| --- | --- |
| Overflow diagnostic | `overflow-layout-not-supported`: 1 → 0 |
| Total formatting issues | 21 → 20 |
| Remaining diagnostics | Float 8, display 9, clear 3; unchanged |
| Formatting work | 8965 → 8968; other recorded metrics unchanged |
| Captured resources | 8, totaling 72,064 decoded bytes |
| Adapter attempts / wire requests | 8 / 0; no HTTP |
| Original workload | One homepage navigation, one discovered Tutorial click, two queries, one formatting call |

The Tutorial click failed with `AgentBrowserError`, code `invalid-input`, message
`Invalid overflow ownership`. No returned click result or destination request
established successful admission. No uncaptured destination was attempted and no
destination navigation completed. The original document remained alive.
`observationComplete` is true, but `flowPassed` is false. Verifier exit 0 confirms
integrity and the narrow diagnostic delta, not action or whole-flow acceptance.

The comparison baseline is the sealed
`node_modules/.cache/native-validation/native-python-sticky-september14/before-RESULT.json`,
SHA256 `a3098ef0055177c516721ea5cf0893cc0913a9eb4cc420329bd6d2c65e14905a`.
All other diagnostic counts remain unchanged; partial failures are retained.

## Frozen Source And Runtime

The replay used base `dcef8ada9fe56f791b2725108b823b372e47d3fd` and exactly
`node_modules/.cache/native-validation/native-overflow-september14-round01/snapshot01/dist`.
It did not use root `dist`. The parent release records feature commit
`d46fff7ba25add1368bb841cb11e5ffd527701df`; that commit is not a replacement
runtime binding or evidence for a later ownership correction.

The accepted gate records 22,050 passed, zero failed and two original exclusions;
436 selected files, 435 strict roots, 788 manifest entries, 1,341 source files and
2,172 compiled files. Ten new suites contain 272 cases; the passing-count delta
from the immediate prior gate is separately 277. These are existing gate results,
not tests rerun for this report.

All paths in the evidence tables below are relative to
`node_modules/.cache/native-validation/`. The directory aliases are exact:

- `GATE`: `native-overflow-september14-round01`
- `REPLAY`: `native-python-overflow-september14-v2`
- `HANDOFF`: `overflow-integration-work-september14/python-replay-v2`

| Frozen gate artifact | SHA256 |
| --- | --- |
| `GATE/AUDIT.json` | `506555392747a5aed81c85a869db6f5251ed48cd92f0fdf4bebf88bf07b3c075` |
| `GATE/RECEIPTS.sha256` | `48283ae5f371898de51ea8ae2f160228404aa93aa7a11aed6e61dcfa20bd3f1c` |
| `GATE/results/source-before.sha256` and identical `source-after.sha256` | `29d7fa74b73c7fd9aa0de5a0c5fa7654cb9c8d5b5247847288563474015a9a58` |
| `GATE/compiled.sha256` | `fb69731c2a918887678b00b0a8fb1b7802288c4061fee3a25dc845eb8c7e8002` |
| `overflow-integration-work-september14/gate-verification/GATE-VERIFICATION.json` | `42ed4e97ff74e3acfa0a9ac48f28436b8a765a25261189a0705a87fd36366b4e` |

## Sealed Replay Evidence

Actual authorization is retained in `HANDOFF/PARENT-RELEASE.md`,
`HANDOFF/AUDIT-READY.md` and `HANDOFF/RELEASE.json`. All 18 run ledgers
(10,851 entries) passed verification. The six original workload/guard files,
fixtures, caps, prior lanes and preparation seals remained unchanged.

| Replay artifact | SHA256 |
| --- | --- |
| `REPLAY/EVIDENCE.sha256` — 49 entries | `04f732cb045af24a586e314b0e4af0c33174f0f3cf525e9ba167bdf4998295ee` |
| `REPLAY/before-RESULT.json` | `a434091dd8f222293c9446fd04c9b3af56324a3bb1b0486adccee3421e7752b5` |
| `REPLAY/VERIFICATION.json` | `16f18362f38eb82b0327d208403f82b65d2d2232f0a64c9bca5747372f9d4aca` |
| `HANDOFF/REPLAY-EVIDENCE.sha256` — 18 entries | `963b8ba86ab9e9642abe434e656637a724679dcb034976e5219533a566f1f3f1` |
| `HANDOFF/INDEPENDENT-REPLAY-VERIFICATION.json` | `9d2a66c25690f0976f8f169b591d646ce43fe9407fdc80357e4f9488c12d7341` |
| `HANDOFF/REPLAY-REPORT.md` | `86ab7d50d312e3a04783a057a42f184c50de7fc4cf8c9bc60076b4d1d3fdad05` |

Handle `43680` was reaped with exit 0. Process group `1239477` was independently
confirmed absent. Private HOME/TMP directories were empty and removed; no
integrity or cleanup errors were recorded. No retry, fallback navigation, extra
fixture, live request or scope expansion occurred.

This is offline captured-page evidence only. It does not establish live-site,
whole-site or overall-browser acceptance. The parent is investigating formatter
ownership separately through synthetic regressions; this replay does **not**
prove any subsequent synthetic fix on the saved Python page. This documentation
task performs no new replay, renderer execution, browsing or synthetic tests.


## Synthetic Ownership Follow-Up

New synthetic fixtures reproduced the same ownership error for flex/grid
containers with discarded whitespace. Formatting normalization retains those
unused nodes in its arena; requiring every allocated node to remain reachable
incorrectly rejected these valid layouts. The correction keeps bounded identity
validation of every slot, but requires reachability only for consumed box,
containing-block, fixed-node, text-context, fragment and glyph references.
Duplicate, cycle, numeric and work-limit guards remain in place.

The retained pre-fix focus records **90 pass/2 fail**. The final focus records
**101 pass/0 fail** across six files, including **15 new cases** for normalization,
scrolling geometry, discarded identities and invalid measured references.
Independent static review found the unused-entry structural gap before final
adoption; three cases and charged arena validation address it. The earlier
12-case candidate remains recorded separately: its selected gate passed
22,062 tests before that hardening.

The final selected native gate records **22,065 pass/0 fail/2 unchanged
exclusions**, 437 selected files, 436 strict roots, 789 manifest entries and
352 unselected entries. Build, strict checking, scoped formatting, exact suite
and case comparisons, source stability and inventory verification pass.
The snapshot retains 1,342 source files and 2,172 compiled files. These are
synthetic native results, not another saved-page or live-site replay.

Evidence is retained under `node_modules/.cache/native-validation/overflow-ownership-work-september14/`:

- `before00`: immutable failing regression evidence.
- `focused01`: final focused validation.
- `release00`: superseded passing candidate, not the adopted source.
- `release01`: final selected gate and source/compiled inventories.
- `release01/AUDIT.json` SHA256: `603ee5107f1f75e5adc646949dc97fbda28b22ef966bc5106dc813f651795419`.
- `release01/RECEIPTS.sha256` SHA256: `a5668f7d29d29afe400fe5d5003ddf9092a1c13e3a0d8e28f4b55d6da210b195`.

**The saved Python Tutorial flow has not been rerun after this correction.**
Matching the synthetic error does not prove that this was its only cause.
No earlier replay or gate measurement is relabeled as post-fix site evidence.
Further captured-page replay needs a separately bounded execution lane; live
website, credential/device, SafeJS, socket, TTY and challenge gates stay open.
