# Native root-scroll CSS cache reuse

September 4, 2026 continuation of `STYLE-PRESENTATION-CACHE.md`. This extends the
explicit presentation-only boundary to native root scrolling. It does not add
element scrolling, incremental layout, smooth scrolling or a new rendering engine.

Later continuation: `ROOT-SCROLL-EXTENT-CACHE.md` separately reuses unchanged
extent bounds across these notifications. The CSS-only scope and original
measurements below retain their historical meaning.

## Measured cause

The preceding `fd85e20` code reports a completed CSS cascade counter. On a plain
oversized block with a 120 by 80 viewport, four root movements to vertical offsets
10, 20, 30 and zero change the cached CSS object four times and advance completed
cascades from one to five, although no CSS input changes.

Both explicit root movement and automatic clamping call ordinary presentation
invalidation. As with the earlier caret repair, an untagged style notification
requires a conservative full cascade. Native scroll coordinates are consumed by
layout projection, geometry, hit testing and painting, not current CSS computation.

## Narrow implementation

Only the two notification calls in `DocumentScroll` change: explicit movement and
automatic clamp now use `invalidatePresentation("paint")`. They retain the same
style kind, root target, monotonically increasing document revision, handler
timing and bounded journal. The additive `presentationOnly: true` marker permits
CSS map reuse through the already-tested conservative path.

Coordinate validation, fractional values, bounds, update/work budgets, no-op
semantics, reentrant movement and close behavior are unchanged. Equal/clamped
no-op requests still consume the existing update budget without adding a revision.
The layout/extent refresh path is not bypassed or cached differently.

Real attributes, stylesheet text, external sheets, viewport/media changes, focus,
pointer state and other CSS inputs still invalidate normally. A dimension change
can therefore rebuild CSS once and subsequently clamp the scroll position without
adding a second cascade solely for the resulting presentation notification.
Journal loss and mixed relevant changes still conservatively rebuild.

The document revision still changes on actual movement. Client rectangles, hit
targets, visible pixels and scrolled control carets must follow the new position;
document-coordinate geometry remains distinct. Fixed versus normal/absolute
projection uses the existing supported native layout paths.

## Validation evidence

The 17 new low-level notification cases initially record 10 failures and seven
passes on preceding production. They exercise marker/kind/target/revision,
fractional/clamped movement, unchanged requests, source mutation versus automatic
clamp, viewport invalidation, reentrant moves, invalid coordinates and close.
The reentrant baseline failure is a handler waiting for the newly introduced
marker, not an independently established older reentrancy defect. After the two
call-site changes, all 57 cases in the new file plus `viewport-scroll.test.ts` pass.
Only local naming/formatting corrections follow that baseline; assertions remain
the same.

The cache worker adds 18 cases. On exact preceding production, the identical final
tests record 17 failures and one pass; actual parent production passes all 132
cases across four files (18 new plus 114 existing). Thus all **35 new cases** pass
in their focused lanes. They verify cache identity and actual counters alongside
fresh geometry, hits, fixed/absolute projections, wheel/hover sequencing, keyboard
and scroll-into-view actions, source/viewport changes, automatic clamp, reentrant
mutations, bounded journal fallback and focused control/placeholder behavior.

The first worker replay had five fixture failures: four correctly rejected an
unsupplied external stylesheet and one distinguished negative zero from canonical
zero. The fixture now supplies an empty sheet before setup, and expected client
coordinates use subtraction from zero. Relevant-refresh tests also allow shared
unchanged text-style identity while still requiring the actual cascade and
get/box/paint replacement. The final baseline and replay use identical assertions;
all intermediate evidence is preserved.

Test delivery and baseline/replay provenance remain at
`node_modules/.cache/native-validation/parallel-scroll-presentation-cache-fd85e20/delivery/README.md`.
The low-level baseline is `scroll-presentation-notifications-baseline.log` in the
same native-validation cache; its original test source is retained separately.

Final seventeen-file integration runs pass **471 tests in both isolated and
working trees**, including all 35 new cases. Source typechecks, builds using
`--outDir dist`, strict checks for both new test files and scoped Biome checks
pass. Populated JSON summaries and command logs use the
`scroll-presentation-integration-final-*` prefix in the native-validation cache.
Both manifests retain 388 unique entries; 22 pre-existing pending-only test files
are absent from the isolated archive and are not silently supplied or relabeled.

## Native capture and counter evidence

Eighteen actual injected command-host phases run on the exact `fd85e20` baseline,
isolated repair and working build: **54 captures and 36 byte-identical cross-build
PNG comparisons**, with zero changed pixels, masks or normalization. Geometry,
hits, source glyphs, native values/selections, snapshots, paint and actual revision
numbers match. Every artifact is released and the injected hosts/transports close.

Wheel movement covers both axes, negative and maximum movement, keyboard
PageDown/Home/End, scroll-into-view, a visible scrolled input caret, extent shrink,
viewport resize and absolute targets. A fixed label stays at the same client
origin. Sixteen adjacent phases change the image; only the intentional clamped
no-op is identical. Viewport-size changes are recorded as such, not misleading
same-size pixel counts. The parent inspected the scrolled-caret capture.

Thirty cache samples cover ten actions on each build. Unlike the earlier caret
baseline, all three builds here expose the real successful-cascade counter:

| Actions | Baseline added cascades | Repair added cascades |
| --- | ---: | ---: |
| Seven pure scroll moves | 7 | 0 |
| Repeated clamped no-op | 0 | 0 |
| Real style shrink and resulting clamp | 2 | 1 |
| Viewport change and resulting clamp | 2 | 1 |
| Total | 11 | 2 |

The two required CSS-input rebuilds remain; nine unnecessary rebuilds disappear
in this bounded fixture. `get`/`box`/`paint` object changes fall from nine to two.
Unchanged text-style identity is shared even across these full cascades and stays
unchanged in both versions; text identity alone is not used to infer a rebuild.

The first runner assumed fill would scroll an offscreen input into view. Its
stale-image guard failed correctly. That attempt, its eighteen images and runner
are retained. The final fixture uses the supported scroll-into-view command
before fill and asserts the caret stays visible below the fixed label. No
production fix, enlarged mask or weakened image comparison was introduced. The
label's existing wrapped overflow remains visible and unchanged.

Capture evidence is retained at
`node_modules/.cache/native-validation/parallel-scroll-presentation-capture-fd85e20/`:
`FINAL.md`, `comparison.json`, exact runners, logs and per-stage `evidence.json`
record source/build fingerprints, commands, fixture lineage and measurements.
Both actual roots still match those fingerprints after parent verification.

## Acceptance boundary

This is a native correctness/cache-counter lane. No timing, RSS, allocation or
end-to-end speedup claim follows from a reduced cascade count. The full native
manifest remains unapproved after its earlier denial, and no broad filtered
substitute is used. Actual SafeJS, live websites, sockets, TTY/PTY, GUI and original
browser acceptance gates remain separate and open. Historical reports and the
pre-existing uncommitted tree are preserved; new archives/evidence use HOME cache.
