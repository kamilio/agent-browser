# Two-phase Grid percentage rows

September 11, 2026. Follow-up to GRID-LAYOUT.md and GRID-OVERFLOW.md; their
original results and unsupported-profile statements describe those earlier builds.

## Root cause and implementation

A nested Grid item can be measured before its parent's row area is known. The
old unconditional rejection of percentage rows in that first, indefinite-height
pass incorrectly rejected a later-definite layout, such as a 100%-height item
inside a 100px row with its own 50% row. Guessing an early row height for one
fixture would leave the underlying dependency unresolved.

Grid now uses two explicit track-sizing phases:

1. Treat cyclic percentage row functions as auto for intrinsic sizing, including
   any container min/max-height rerun. Cyclic percentage gap terms contribute
   zero in that phase; fixed terms remain.
2. Retain the resulting intrinsic container height independently of final track
   extent. Apply the container's height constraints, resolve percentage rows and
   gaps against that result, and recompute automatic item minima using the final
   basis before sizing the actual tracks/items.

Final percentage tracks may overflow or occupy less than the container; their
extent does not resize the container a second time. This distinction also keeps
the shared page coordinator's shell height consistent. Nested Grid items still
receive their actual parent area in the existing item-reflow phase.

The exported cyclicPercentageRows capability is now true within the existing
partial Grid profile. This does not implement positioned Grid, baseline layout,
inline Grid, unsupported grammar or replaced-item stretch feedback.

## Source and regression evidence

The already captured native Grid7.2 section explicitly distinguishes intrinsic
percentage treatment from final resolution against the resulting container size.
It is preserved as section-1.jsonl under
node_modules/.cache/native-validation/native-grid-spec-sections-september11/,
with the original provenance/reader limitations in GRID-SPEC-SECTIONS.md.
This follow-up reads that native extraction; it performs no new source request.

Development snapshots under
node_modules/.cache/native-validation/native-grid-percentage-work-september11/
exclude the independent list-item worker's formatting edits:

- Baseline: **28 passes, eight failures**. Seven cases hit the old percentage-row
  rejection; percentage-gap layout used the wrong row offset.
- fixed01: **29 passes, seven failures**. Track resolution worked, but reporting
  final track extent as natural container height exposed the coordinator mismatch.
- fixed02: **36 passes, zero failures** after preserving intrinsic height.

Eight regressions cover explicit/auto-height nested items, undersized and
overflowing percentage rows, min/max container constraints, percentage gaps and
final automatic-minimum capping. Prior failures and immutable development
snapshots remain unchanged. Existing horizontal-only and baseline rejections
retain explicit tests; no new hidden exclusion replaces a failing case.

## Clean selected gate

Tracked df5028b plus only src/grid-layout.ts, src/grid-layout.test.ts and
src/grid-intrinsic.ts passes **8,115 cases, zero failures, one existing excluded
assertion** across 131 selected files and 130 strict roots. Build, strict typing
and formatting pass; all 1,017 source files stay unchanged. Execution is
September 11, 2026, 14:12:55.074–14:14:41.443 UTC, in
node_modules/.cache/native-validation/native-grid-percentage-september11-round01/.
The historical snapshot strict omission and total-host-object-ceiling runtime
exclusion remain unchanged. This gate excludes the concurrent list-item changes;
it is not combined-source or live-site acceptance.

## Acceptance scope

These cases use synthetic native documents. Neither captured MDN replay includes
this later percentage fix. Its absolute accessibility-menu boundary, other
formatting/CSS issues, public-site coverage, the original research topics and
credential/passkey/fingerprint/challenge acceptance remain separate open work.
