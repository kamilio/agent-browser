# Native SVG path/fill foundation — September 11, 2026

## Why this work exists

The unchanged Test Pages replay identifies its inline SVG logo as one actual
deferred element. Native SVG cannot be enabled by deleting that warning: paths
need real geometry and paint. These modules provide that foundation without a
browser/runtime dependency, placeholder image or change to the current guard.

**This is not yet BrowserSession inline-SVG support.** The existing formatting
traversal still defers SVG. DOM scene construction, SVG/CSS presentation cascade,
viewBox/preserveAspectRatio sizing, transforms, stroke paint, descendant geometry
and hit testing, and live website acceptance remain separate integration work.

## Implemented primitives

- `parseSvgPath` normalizes all SVG path command families, including relative and
  repeated commands, reflected controls, subpaths and elliptical arc flags. It
  preserves geometry rather than substituting curves with endpoint chords.
  `SVG-PATHS.md` records parser limits and explicit malformed-input behavior.
- `flattenSvgPath` converts normalized paths into detached, frozen contours.
  Quadratics/cubics use bounded adaptive subdivision. Flatness checks use the
  finite chord segment, retaining collinear overshoot and closed loops. Elliptical
  arcs handle rotation, radius correction, both flags and the zero-radius/equal-
  endpoint degeneracies. Tolerance is in the supplied coordinate units; callers
  must account for output transforms rather than pretending it is always pixels.
- `rasterizeSvgFills` paints destination-pixel contours with nonzero/evenodd fill
  rules, implicit subpath closure, viewport clipping and source-over RGBA paint.
  Opposite-winding holes and coincident edges are covered. Pixel-center/half-open
  boundaries deliberately match native rectangle paint. This helper does not
  claim antialiasing, strokes, filters, masks or arbitrary SVG rendering.

## Bounds and precision

Parser defaults remain 262,144 source units, 16,384 segments and coordinate
magnitudes at most 1e9. Flattening allows at most 16,384 segments, 65,536 points and
24 subdivisions in a branch. It charges traversal/subdivision/sample work to the
caller. Arc sample counts are checked before creating points.

Fills share aggregate ceilings of 4,096 shapes, 16,384 contours, 65,536 points and
65,536 nonhorizontal edges. Raster dimensions/pixels retain the existing global
4,096 / 4,194,304 ceilings. Allocation, edge scans, sorting and spans are charged
before their work; caller exhaustion propagates. No global resource cap increases.
Scan conversion is bounded scanline/edge work, not a claimed optimized SVG engine.

Source review found two real numerical faults in the initial flattening prototype:
near-coincident endpoints lost large arcs after subtracting rounded absolute
angles, and large-coordinate midpoint rounding could silently violate a tiny
requested Bézier tolerance. Both were reproduced in isolated fixtures: 32 passed,
three failed (two sweep directions and one quadratic).

The correction derives angular extent from the normalized chord and explicit
large/small choice. Curve approximation reserves a conservative floating-point
allowance and rejects unsupported precision rather than accepting rounded-away
geometry. This is bounded native numerical behavior, not a formal proof of
arbitrary SVG numerical conformance. The original failing evidence is retained.

A follow-up review exposed direction-dependent rounding in scanline crossings:
two reversed copies of the same sloped triangle incorrectly painted a pixel.
Both nonzero/evenodd fixtures reproduced the defect (213 passed, two failed).
Edges now use canonical increasing-Y endpoint arithmetic, while retaining their
original direction for winding. No epsilon merging hides thin geometry. The
corrected targeted run passes 215 tests, including both new regressions.

## Validation boundaries

The isolated parser worker passed 109 tests, strict compilation and formatting.
The parent verified its four source/document pins and receipt ledger before a
local descriptive-variable naming cleanup. The corrected combined targeted lane
passed 213 tests: 109 parser, 35 flattening, 22 fill raster, 26 bitmap-font and 21
existing raster cases. Fixtures include independently evaluated curves, winding
classification, exact pixels, alpha composition and resource/owner failure paths.

Evidence lanes are
`node_modules/.cache/native-validation/svg-path-worker-september11/` and
`node_modules/.cache/native-validation/svg-flatten-work-september11/`.
The failed fixed02 and passing fixed03 snapshots remain distinct and immutable.
The subsequent fixed04 failure and fixed05 correction are also retained. A first
broader gate passed 9,354 tests before the sloped-edge finding was discovered;
that snapshot is superseded rather than described as containing the correction.
Final clean-gate results are recorded after independent audit, not inferred from
the focused tests. No live page used this new foundation during these checks.

## Final clean gate

Round02 ran at **18:47:48.615–18:50:00.054 UTC on September 11, 2026**.
Build, strict compilation and formatting passed, followed by **9,356 passing
native tests, zero failures and two unchanged exclusions** across 156 selected
test files. The clean manifest has 561 entries; strict checking has 155 roots.
This is not an execution of every manifest entry. The existing total host-object
ceiling and stale Grid unsupported-display exclusions remain, as does the strict-
only omission of `src/snapshot.test.ts`.

The parent audit at 18:50:10.144 UTC proves clean `ddf4aad` plus seven new source/
test files and three manifest additions, with 1,026 other tracked inputs unchanged.
No existing browser production source changes. The snapshot has 1,034 source/input
and 1,852 compiled files; both complete ledgers were independently verified after
execution. Unrelated dirty work and two unrelated manifest entries are excluded.
Independent source review confirms all three reported fixes for their inputs;
its final raster source/test pins match the audited candidate.

Evidence:
`node_modules/.cache/native-validation/native-svg-foundation-integration-september11-round02/`.

| Artifact | SHA-256 |
| --- | --- |
| Source inventory | `773561650c9f962b9764221b4656162a6366d408f694dc73182a06e6c637fbc7` |
| Compiled inventory | `479dddae8cb6d64a00ccf392df85c3ff815162d8119ac2db28e11c84f3da900d` |
| Native results | `2db2ff4afe6b3935bb6b3172b3263adb9651fe8c81a7ed37f13010c3d8b204ef` |
| Gate summary | `1ea0cab9c92531104451bdbb9e5325ae3844024e1738a0c76594d24967248c7b` |

## Next integration gate

Build an actual native SVG scene and replaced-box integration, with explicit
unsupported features instead of silent omission. Verify default/intrinsic sizing,
CSS dimensions, paint inheritance/currentColor, lifecycle invalidation and pointer
ownership before relaxing the SVG formatting guard. Then rerun unchanged captured
content and fresh browser interactions. Test Pages also retains table, clear,
overflow and CSS limitations; SVG primitives alone do not make its form clickable.
