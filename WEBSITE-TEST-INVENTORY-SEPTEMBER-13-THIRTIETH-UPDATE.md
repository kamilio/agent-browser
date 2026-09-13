# Website test inventory — September 13, thirtieth update

**Native underline offsets now reach actual pixels. Python's unsupported-property
count drops from nine to eight, but its actual Tutorial click still fails.** This
continues inventory 29 without rewriting any historical result.

## Native functionality

`text-underline-offset` is inherited and independent of the decoration shorthand.
Signed lengths, percentages, bounded math, font/viewport computation, CSSOM and
cache invalidation are covered. Explicit zero starts at the alphabetic baseline;
automatic placement remains unchanged. The originating decoration retains its
position through descendants; overline/strike-through and geometry are unchanged.

Two new test files add **136 cases**: 84 style/CSSOM and 52 actual-raster cases.
Corrected baseline: 740 passed / 143 failed. Candidate: 883 passed / zero failed.
All new cases fail on the baseline. Seven updated existing expectations include
the independent property; the initial single stale-object expectation failure
and all initial results remain preserved.

Selected native gate: **20,313 passed / zero failed / two unchanged skips**,
394 suites / 393 strict roots / 756 manifest entries. The 362 unselected entries
remain unselected. Build, strict compilation, formatting and unchanged-input checks
pass. Run: September 13, 17:06:40.641–17:11:19.560 UTC.

Runtime: `native-underline-offset-september13-round00/snapshot01/dist` under the
native-validation cache. Audit SHA-256:
`c7c9b5d3ae8563ab3f8141dc49adf6a40084b06ffa67f829916656ef01fc2dd8`.
The audit verifies 1,297 source/config inputs, 2,124 compiled files and 1,287
unchanged tracked inputs. See `TEXT-UNDERLINE-OFFSET.md` for exact scope and ledgers.

## Python documentation replay

One native homepage navigation, one discovered Tutorial click and one bounded
post-click formatting inspection use the same eight captured resources and
72,064 decoded bytes. **No new Python HTTP request occurs.** At
17:11:28.434–17:11:28.691 UTC, the same 853-node/revision-860 document and `e375`
link reproduce the remaining failure. No direct destination fallback is counted.

- Applicable unsupported properties: 9 → 8; unsupported/invalid values: 1 → 1.
- Raw property/value counts: 57/6 → 54/6. Rules/declarations stay 584/1,075.
- Cascade work: 93,872 → 93,886. Formatting metrics remain unchanged.
- Actual click still reports inline alignment twice, positioning once and overflow
  once, alongside the remaining CSS failures. Raw float/display/clear markers stay.

This is not successful navigation, whole-page rendering or a performance speedup.
See `PYTHON-UNDERLINE-OFFSET-REPLAY-SEPTEMBER-13.md` and its 28 sealed receipts.

## Wikipedia cross-site replay

A separately bounded native check reuses the unchanged 119,573-byte portal body,
SHA-256 `6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
Three native queries, one formatting inspection and one geometry request run at
17:15:09.981–17:15:10.288 UTC. **Zero HTTP requests; no pointer action, submission
or raster.** The genuine fieldset/search-input ownership and rich submit button
`e522` with child `e524` remain intact.

| Observation | Historical 18,046 runtime | New 20,313 runtime |
| --- | ---: | ---: |
| CSS issue occurrences | 153 | 132 |
| Unsupported CSS properties | 105 | 97 |
| Unsupported/invalid selectors | 21 | 8 |
| All formatting issue occurrences | 249 | 233 |
| Formatting boxes | 2,238 | 2,252 |
| Formatting text code units | 5,005 | 5,016 |
| Counted formatting work | 16,700 | 18,689 |
| Deferred subtrees | 1 | 3 |

Visited DOM nodes remain 2,114. This is a cumulative comparison across runtime
changes since the historical button-content check, **not an isolated attribution
to underline-offset** or a speedup. Additional generated content now exposes two
unsupported generated-display subtrees and a generated-clear issue. The original
deferred logo image remains. These new failures are retained, not filtered out.

**Geometry remains unsupported.** The geometry error enumerates 192 issue
occurrences plus three unexpanded issue types, versus 213 enumerated occurrences
before. The truncated message is not a complete occurrence count. CSS values,
at-rules, media, overflow, inline alignment and direction failures remain, among
others. No rectangle or search success is invented.

Inspection exits zero with closed owners, empty removed HOME/TMP, an absent
process group, zero guard attempts and unchanged source/runtime/historical pins.
Wrapper differences are explicitly recorded in `WRAPPER-CHANGES.md`, including
recording actual geometry support rather than asserting it must fail.
Evidence: `node_modules/.cache/native-validation/native-wikipedia-underline-offset-september13/`.
Both website checks in this update are offline replays, not new live visits.

## Remaining work

Python justification, hyphenation/vendor variants, cursor, border radii, inline
alignment, sticky positioning and overflow still need work. Investigate the
Wikipedia generated-display/clear failures next, using native attribution rather
than dropping the new diagnostics. More varied-site
interactions and repeatable performance measurements remain necessary. Cold
ancestor-style computation is a review-identified performance risk, not a measured
regression or speedup. This feature reuses previously captured CSSWG reader
sections; it is not a new source-site visit or research refresh.

Original hardware/benchmark/Astra evidence is not refreshed here; verified
Reddit/Poe opinions remain incomplete. The two native skips, unselected suites and
separate credentials, passkey devices, SafeJS, sockets and TTY gates remain open.
No fingerprint spoofing or challenge solving is performed. Changes are focused
local commits with pre-existing work preserved; no push. Overall goal: **ACTIVE**.
