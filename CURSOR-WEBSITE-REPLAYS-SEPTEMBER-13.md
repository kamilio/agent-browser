# Cursor support: unchanged Python and Wikipedia replays

**September 13, 2026: fewer genuine CSS diagnostics, but neither requested flow
passes.** These are native replays of original captured resources, not fresh live
website requests. No source/style stripping, forced geometry or direct-destination
fallback is used. Native test success is a separate observation.

## Python documentation

A fresh prior-runtime baseline at21:55:33.241–21:55:33.502UTC uses the audited
21,169-pass runtime. Its comparison at22:02:48.953–22:02:49.210UTC uses the audited
21,262-pass cursor runtime. Each replays the same eight fixture responses: seven
captured on September11 and `basic.css` on September13,72064decoded bytes total.
Each makes one native navigation, two queries, one formatting inspection and one
genuine click on discovered Tutorial linke375; eight fixture-adapter requests but
**zero wire HTTP requests**. The captured title is3.14.7 Documentation, not a claim
about the currently released Python version. Harness filenames retain `before-`
in both lanes; pinned runtime and lane identity distinguish them.

Unimplemented property diagnostics fall **8→7**. The remaining invalid-value,
position and overflow blockers remain1each; float8/display9/clear3 also remain.
Both Tutorial clicks throw the genuine unsupported-width-resolution error rather
than navigating. There is no fabricated destination or click success.

Both retain853DOM nodes/revision860,576visited nodes,669formatting boxes,
4074text units,8965formatting-work units and9deferred subtrees. Style work changes
**93886→94741** as computed cursor inheritance is accounted for. No speedup claim.

## Wikipedia portal

At22:04:29.861–22:04:30.169UTC, the same119573-byte captured response is loaded by
the new runtime. Its SHA-256 remains
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
The predecessor is the21:28:05UTC line-edge replay, not a newly fetched baseline.
One load, three native queries, one formatting inspection, one input-geometry
attempt and two generated-style reads execute; **zero HTTP, actions or rasters**.

| Observation | Before | After |
| --- | ---: | ---: |
| Unimplemented CSS properties |97|85|
| Total CSS diagnostics |132|120|
| Total formatting diagnostics |199|187|
| Formatting work |20974|20974|
| Full input geometry |Unsupported|Unsupported|

All non-cursor issue counts remain unchanged: invalid CSS values24, at-rule1,
selectors8, media2, overflow7, positioned coordination16, element1, direction22,
display2, float14, clear5. Both retain2708nodes/revision2712,2114visited nodes,
2250boxes,5016text units and3deferred subtrees. Input/button/fieldset identities,
closed-dialog handling and generated footer metadata are unchanged.

The full geometry error still names CSS values/at-rule/properties/selectors,
overflow, the deferred element and direction. This is not a search-submission,
raster or portal-functionality pass. The deferred logo asset was not fetched in
this single-body offline profile; it is not proof that native PNG is unsupported.

## Isolation and evidence

Source/runtime/fixture/framework/history checks match before and after. Native
documents/queries/transports close, request queues empty, private HOME/TMP remain
empty and are removed, and recorded process groups983431,987821,989265 are absent.
No network/process guard attempts or cleanup errors occur. Empty guarded private
environments prohibit credentials, device access, SafeJS and real TTY usage.
Python retains its30+5second deadline/10MiB cap; Wikipedia additionally has a35s
outer watchdog and run-once lock. Do not infer a Python watchdog test from this.

The first Wikipedia preparation changed an expected hash accidentally through a
bare numeric-count substitution; integrity checks rejected it before any browser
probe. A preparation retry hit write-once inventory files. The partial lane and
failure record are preserved; the corrected labeled substitutions prepared a new
lane, whose single probe completed. No completed probe was rerun or overwritten.

Evidence paths below are relative to `node_modules/.cache/native-validation/`:

| Lane / ledger | Entries | SHA-256 |
| --- | ---: | --- |
| `native-python-cursor-baseline-september13/EVIDENCE.sha256` |28|`79759221ae3291714b9bfa4542472e9699f29ebbcf7e8d717507ca6dc5ae1bbc`|
| `native-python-cursor-september13/EVIDENCE.sha256` |28|`d15694cd6bc2d06c072472dc8ce0273905947f226c3ec8226149d66589fa5fbc`|
| `native-wikipedia-cursor-september13/EVIDENCE.sha256` |31|`96fae2d23551230585edee36d017e46a4110ecdd23946911e84f013e9c5eebe3`|

Parent checks are `cursor-work-september13/PYTHON-BASELINE-VERIFICATION.json`,
`PYTHON-AFTER-VERIFICATION.json` and `WIKIPEDIA-VERIFICATION.json`; preparation
failure details are in `PREPARE-CORRECTION.md`. Single subsecond timing/RSS
observations are not benchmarks, speedups, live acceptance or cross-browser parity.

Next: rounded borders/background clipping and hit testing, original-asset flows,
remaining CSS/layout gaps and varied-site performance. The broader browser goal
and the requested hardware/benchmark/Astra/verified Reddit-Poe research remain open.
