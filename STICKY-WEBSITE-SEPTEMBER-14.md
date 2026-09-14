# Sticky positioning and captured Python replay — September 14, 2026

Commit `7ec49ac` implements actual root-scrollport sticky positioning rather than
only accepting the CSS keyword. Its supported profile and limits are in
`STICKY-POSITIONING.md`. This observation reuses the original captured Python
resources; it is not a fresh live capture or a completed Tutorial navigation.

## Bounded native observation

`native-python-sticky-september14` performs one native observation at
**01:18:52.344–01:18:52.467 UTC on September 14, 2026**. The pipe-only process runs
01:18:52.216–01:18:52.479 UTC and exits zero. It performs one homepage navigation,
two queries, one discovered Tutorial click attempt and one formatting inspection
after that click fails. There are **zero HTTP requests** and zero page scripts.

All eight resources remain byte-identical: seven September 11 captures and the
September 13 `basic.css`, totaling **72,064 decoded bytes**. The literal
`before-RESULT.json` filename is retained. No stylesheet is stripped, no resource
is rewritten or omitted, and there is no direct-destination fallback or expanded
resource scope. The original document remains available after the failed click.

## Exact delta

The immediate baseline is `native-python-hyphenation-september14`.

| Raw diagnostic | Before | After |
| --- | ---: | ---: |
| Unsupported CSS property | 0 | 0 |
| Unsupported/invalid CSS value | 0 | 0 |
| Float layout | 8 | 8 |
| Display layout | 9 | 9 |
| Position layout | 1 | 0 |
| Overflow layout | 1 | 1 |
| Clear layout | 3 | 3 |
| Total | 22 | 21 |

Only the sticky-position diagnostic disappears. Formatting metrics remain
unchanged: 576 visited DOM nodes, 669 boxes, 4,074 text code units, 8,965 work units
and nine deferred subtrees. This isolated diagnostic delta is not a benchmark.

The original Tutorial click still fails with code `unsupported` and the exact
width-resolution blocker **`overflow-layout-not-supported (1)`**. The sticky
guard is gone, but the nested overflow guard is not waived. Other raw formatting
diagnostics remain recorded even where later native coordinators can handle
them. The replay does not establish successful whole-page geometry, painting,
navigation or full website functionality.

## Implementation evidence

The final focused gate passes **1,003/0/0**, including 56 new sticky cases. The
full selected native gate `native-sticky-september14-round01` passes
**21,706/0/2 unchanged skips**, 01:09:31.649–01:14:33.945 UTC: 424 selected files,
423 strict roots and 776 manifest entries; 352 entries remain unselected.
Build, strict checking and scoped formatting pass. Complete inventories contain
1,325 source and 2,156 compiled files, with 1,288 unchanged tracked inputs.

Actual regressions cover thresholds and containing-block release, both axes,
percent/auto and oversized insets, margins, grid areas, nested sticky boxes,
fixed/absolute descendants, stacking, generated content, pixels/hits/captures,
ranges/carets, scroll targeting, invalidation and bounded work. Grid-area
relocation through atomic-inline and float ancestors is exercised. Terminal
newlines that create multiple inline fragments remain explicit rejections;
they are not mislabeled as supported single-line cases.

Historical failures are retained. Full round00 has ten obsolete sticky rejection
failures across nine files; corresponding fixtures now retain independent
overflow/transform guards or test supported behavior positively. The separately
probed, previously unselected `scroll-core.test.ts` still has **25 passes and
three pre-existing failures**, confirmed against unchanged pre-feature inputs:
the grid rejection and static `td`/`th` relative-offset expectations. That suite
is not part of the successful selected gate. No unrelated fix or skip is used
to hide those failures.

Independent gate verification completes at 01:15:00 UTC. Its JSON SHA-256 is
`11acd602174a50a6e81cddca84a3938cc62e4b3288380dd5097afb29ea511144`.
Gate audit SHA-256:
`b3aa024549f71f59dc7c40ce5892b60e82cf2801823304a9052205327bfaf5c0`.
The 20-receipt ledger SHA-256 is
`00f9ec515807979e4a8afaef098ca89300999c54980cfb3102f742c7bf99e1dd`.

## Source and containment

The separate native standards read makes one bounded GET of W3C CSS Position 3,
returning HTTP 200 at 00:36:30.088 UTC. It identifies **Working Draft, 7 October
2025**, not a latest-edition assertion. One live DOM load plus one offline parse
retain the complete sticky and sticky-scroll sections. The source body is
413,143 bytes, the parsed tree has 9,002 nodes, and no assets, scripts, geometry
or raster calls occur. This source read is not a live sticky-layout test.

The replay retains original kernel/JavaScript guards, empty private HOME/TMP,
deadlines, output limits and run-once protection. Native owners close without
cleanup errors; private directories are removed and process group 1140002 is
absent. Replay verification passes 29 checks at 01:18:55.652 UTC.
The result record SHA-256 is
`a3098ef0055177c516721ea5cf0893cc0913a9eb4cc420329bd6d2c65e14905a`.
Replay evidence ledger SHA-256:
`00735256e2e1fda1d81ae227d236a00759e792e8f67a9a4af59a29d6e704cc6b`.
Complete receipts and preservation checks remain in the new source/replay and
`sticky-work-september14` evidence lanes; older lanes are unchanged.

## Outstanding work

Implement real nested overflow/clipping/scrolling and nearest-scrollport sticky
composition, then retest original-resource flows and separate performance gates.
Table/fragmented sticky, transformed or vertical-writing containing contexts and
outside-containing-block margin conformance remain unclaimed. Other sites are
not rerun by this update. Credential/provider/device/passkey, SafeJS, socket,
real-TTY, challenge and incomplete hardware/benchmark/Astra/verified Reddit-Poe
research gates remain separate. The overall browser goal stays **ACTIVE**.
