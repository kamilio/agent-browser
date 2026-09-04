# Shared viewport scrolling and document offsets

September 4, 2026 checkpoint in the standalone seven-day browser plan.

## Ownership

The native viewport owner derives bounded positive-axis scrolling extents from
the shared page layout, including flex items, atomic inline fragments and relative
translation. It clamps fractional positions and invalidates presentation only
when movement occurs. Document or viewport changes recompute extents and clamp
the saved origin before client geometry or a new capture is built.

`DocumentGeometry.getDocumentRects` retains document-space boxes;
`getClientRects` and `getBoundingClientRect` subtract the viewport origin exactly
once. Returned records remain immutable snapshots. Boxless/disconnected elements
keep zero bounds; empty inline boxes retain their actual translated position.

Default raster captures use the current viewport origin. Explicit clips and
element crops retain document coordinates. Movement makes a prepared capture
stale; preparing after automatic clamping snapshots the new revision. Shared
element sizes and offsets do not shrink or move just because the viewport moves.

`DocumentElementOffsets` chooses a supported positioned ancestor or the body,
then measures the first box from the parent's padding edge. Records are bounded
and cached per document revision. Closing the document releases them. Table, td
and th ancestor selection now applies only to static targets: a relative target
skips a static table ancestor, but still selects one that is itself positioned.
This fixes three reproduced failures in the pending owner.

Both owners and their limits/types are exported through the native entry point.
The committed viewport capability record does not claim mousewheel command,
guest scrolling or scroll-event integration before those adapters are promoted.
The broader worktree's existing adapter capability values remain pending.

## Research and evidence

The official CSSOM View editor's draft was inspected on September 4, 2026 at
`https://drafts.csswg.org/cssom-view/`: positive-axis viewport scrolling areas,
first-box/padding-edge offsets, and the static-target table ancestor condition.
This is a bounded native implementation, not full CSSOM View conformance.

The new `src/scroll-core.test.ts` is explicitly listed in `native-tests.json`.
Its 28 cases cover fractional coordinate separation, all four flex directions,
relative padding edges, atomic-inline boxes, capture origins/crops, stale layouts,
document/viewport reclamping, boxless/empty/disconnected elements, invalid input,
cache/closure, work/update bounds, unsupported-layout recovery and table-parent
selection through style mutations.

- Prior HEAD plus the two original pending owners fails 23 of the 28 checks;
  the five passing checks cover native invalid-coordinate rejection.
- The integrated worktree before the offset fix fails exactly the three table
  cases. The corrected implementation passes all 28.
- Focused working-tree validation passes 209 tests across seven explicit files;
  the isolated commit tree passes 130 across five. The two existing broader
  offset/viewport suites remain pending because they include guest/pointer
  adapters not promoted here; they are not rewritten to claim isolated parity.
- Full native validation passes 9,342 tests across 256 working-tree files and
  7,172 across 202 isolated-commit files. Both trees pass build, typecheck, strict
  checking of the new test and six-file lint. The isolated tree contains only
  HEAD plus this checkpoint, not the broader pending source adapters.

## Remaining work and gates

Next connect page/root scrolling and readonly offset getters to the guest DOM,
then coordinate hit testing, pointer routing and scroll-into-view to this shared
origin. Native exported owners are not command, runtime or physical-input
acceptance. Nested scrolling/clipping, scrollbars, smooth/event timing, negative
or RTL scroll origins, transforms/zoom, fixed/absolute positioning, shadow-tree
offset rules and full table layout remain open. Boxless selected offset parents
remain explicitly unsupported rather than receiving invented padding edges.

No runtime dependency was added. No live website, socket, real TTY/PTY or SafeJS
acceptance probe ran; the denied SafeJS probe stays unrun. Historical paths and
reports remain unchanged. The browser scope and seven-day goal remain active.
