# Native inline SVG document integration

September 11, 2026.

This change connects the bounded SVG path, fill, bounds and scene foundations to
the standalone native browser. It does not introduce Chromium, Firefox, remote
rendering, another page runtime, a CAPTCHA solver or a new dependency.

## Supported document path

- An embedded SVG root becomes a native replaced formatting node. Its supported
  descendants retain their real document IDs and references rather than becoming
  synthetic image elements or generated click targets.
- Supported presentation attributes participate below authored CSS in the native
  cascade. The adapter covers color, display, visibility, pointer events,
  overflow and supported SVG/rectangle dimensions. It does not claim a general
  SVG CSS property implementation.
- The scene uses filled paths and supported basic shapes, inherited color/fill,
  per-shape opacity, groups, affine transforms, viewBox and preserveAspectRatio.
  `SVG-SCENES.md` documents its admission and resource limits.
- Intrinsic sizing distinguishes an actual aspect ratio from independent default
  dimensions. Missing dimensions without a ratio use the native 300 by 150
  default object size. Ratio transfer remains conditional in normal, flex, grid
  and positioned replaced-element sizing.
- Native painting uses the actual SVG contours, viewport clipping and existing
  source-over raster operations. It does not fetch a replacement image. Shape
  edges use the existing hard pixel-center fill rule, not antialiasing.
- Geometry reports transformed analytic shape bounds and group unions. Hit
  testing uses the filled contour, not merely that bounding rectangle. Both
  inline fragments and block/atomic replaced boxes use their actual content
  origins, including border and padding offsets.
- Native click handling targets the SVG descendant and follows normal event
  bubbling. A fixture clicks a real path inside an HTML anchor and checks the
  ensuing navigation; it does not substitute a click on the ancestor.
- Document mutations rebuild scene-dependent geometry, hit regions and paint;
  previously prepared rasters retain the existing stale-revision rejection.

## Explicit boundaries

This is a bounded filled-shape profile, not full SVG support. Unsupported visible
SVG text, SVG anchors, nested SVG, use/image/foreignObject, active strokes,
markers, filters, masks, clip paths, group opacity and unsupported transform
origins must not silently disappear. Unsupported native CSS still prevents
issue-free layout. A supported logo does not make the surrounding webpage's
tables, floats, positioning or CSS declarations supported.

The implemented SVG viewport profile clips overflow. Visible viewport overflow
remains an explicit unsupported formatting issue. The inherited pointer-events
profile is the native auto/none subset, not every SVG pointer-events keyword.
External SVG image decoding, SVG script execution, full text layout, full CSS
transforms and reference-browser conformance are not claimed.

Affine arithmetic, path flattening, analytic bounds, shape counts, source sizes,
work budgets and raster dimensions retain explicit limits. Unsupported precision
must fail rather than manufacture plausible but inaccurate geometry. See
`SVG-PATH-BOUNDS.md` and the foundation reports for their narrower contracts.

## Evidence handling

Validation uses immutable, clean-base snapshots and explicit native manifest
entries. Synthetic browser sessions use fixture transport, not real websites.
Native passes do not satisfy live-network, credential, passkey-device, SafeJS or
TTY/PTY acceptance gates. Historical website captures and reports retain their
original paths, dates, response bodies and measurements.

The original newly authored synthetic fixture incorrectly included unsupported
`vertical-align:top`. Its initial baseline and candidate failures are retained,
but are not used as a solely-SVG regression baseline. A corrected fixture, with
that synthetic declaration removed, fails on clean `17c0e99` because embedded
SVG is still unsupported there. Website CSS was not edited to obtain a pass.

## September 11 validation

The final clean-base gate passes **9,614 tests with zero failures and two existing
exclusions**. It selects160 explicit native test files, strictly checks159 test
roots, and uses565 clean manifest entries. Build, strict TypeScript and formatting
all pass. The independent audit verifies1,022 unchanged tracked inputs,21 owned
source/test inputs,1,044 total source inputs and1,876 compiled artifacts. Two
unrelated dirty manifest entries and pre-existing shared-file edits are excluded.

The four new suites contribute257 passing cases:42 affine,27 analytic bounds,
151 scene and37 document integration. One additional BrowserSession regression
passes a genuine SVG-path click and ensuing HTML-anchor navigation with fixture
transport. These are native fixtures, not new live website visits.

The corrected clean-base baseline retains21 positive failures and10 deliberately
excluded negative cases. An earlier candidate retains559 passes/22 failures:
21 from the invalid synthetic CSS and one from missing inline-fragment SVG
geometry. After correcting the synthetic fixture and actual inline geometry/hit
ownership, the focused10-file gate passes581 cases. Additional block/atomic,
border/padding and review regressions are included in the final gate.

Independent source review found an8.79-pixel large-cancellation affine error and
two fail-closed omissions: active markers and nondefault transform origins.
Regressions now pass. Affine admission bounds intermediate products and sums at
1e9 and rejects nonzero multiplication underflow; this is conservative bounded
binary64 arithmetic, not a general exact-arithmetic guarantee. Transform parsing
also rejects non-SVG whitespace.

Final gate UTC: **19:22:16.588–19:24:26.214**; audited **19:24:35.201**.
Clean base: `17c0e99a5d324c49185663167012a64f4001a2e9`.
Evidence: `node_modules/.cache/native-validation/native-svg-document-integration-september11-round01/`.
Retained baseline/candidates and review artifacts are under
`node_modules/.cache/native-validation/svg-document-work-september11/` and the
separate SVG review/worker lanes. No earlier lane or measurement was rewritten.

- Source inventory SHA-256: `9c7de7e5d7e73880b7d98a96487ca66972ede269a398b466041ecf427e2c8207`.
- Compiled inventory SHA-256: `e37c5d5f11d5da5f510aa94db45df93a7a352254781be62e65a571471dae4594`.
- Native result SHA-256: `45a96cd8a66bf3a4166e2ac242a98cb8b56d596cddd2fee83e52345ebd868096`.
- Gate summary SHA-256: `7c4b9fe07c725547335b36f0a3640de9b1e17e3e1acf1817d01187dcf2e3d966`.

The unchanged exclusions are the separate total host-object ceiling test and the
real unsupported-display-alongside-advisory-media test. Strict test roots also
retain the previous snapshot-test omission. These limitations are not fixed or
reclassified by this change. Unchanged captured-site replay and fresh live
interactions remain separate acceptance evidence.

At19:32:30.734 UTC, a subsequent parent check matches22 review-regression cases
against the retained pre-review implementation and the already audited release.
All22 fail on the old implementation and pass in the released gate, with identical
test bytes;171 unrelated cases are excluded from this narrow reproduction. The
old-input run is retained as `svg-document-work-september11/fixed04`, with
`REVIEW-REGRESSION-VERIFICATION.json` recording exact matching names. It is a
post-fix baseline reproduction, not another release gate or website visit.

The subsequent unchanged-capture website replay is recorded in
`TESTPAGES-SVG-REPLAY-ROUND02.md`: two native/mock responses, zero wire requests,
actual SVG scene admission, but the original checkbox click still fails the
formatting-profile guard. Parent verifies all51 named evidence checks, both
ledgers, original capture hashes and zero cleanup state. This does not establish
whole-page raster or pointer acceptance. `TESTPAGES-SVG-REPLAY.md` retains the
earlier preparation-state note, not the final run status; that first lane's
metadata-path preflight failed before any browser launch and remains sealed.
