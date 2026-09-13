# Native SVG clipping

The native engine supports local-fragment `clip-path` references to SVG
`clipPath` definitions, without Chromium, Firefox, remote rendering, new page
runtime dependencies, rewritten assets or enlarged decoder limits.

## Supported Behavior

- Basic path, rect, circle, ellipse, polygon, polyline and line silhouettes.
  Curved paths use the existing bounded path flattener and native fill raster.
- Union of a definition's children, with each child's inherited `clip-rule`
  (`nonzero` or `evenodd`); intersection of distinct ancestor/element clips.
- `userSpaceOnUse` and nondegenerate `objectBoundingBox` coordinates, including
  referencing-group, definition, child and viewport transforms. Group bounding
  boxes use unclipped descendant geometry, not painted/stroked pixel bounds.
- Same-document references across inline SVG roots. ID lookup is case-sensitive,
  percent-decodes fragments and honors the first matching document ID. A missing,
  malformed or wrong-kind local reference does not clip; an empty valid clip
  removes all paint and hits. External URL references remain unsupported.
- Definitions remain referenceable beneath `display:none` ancestry. A clip
  child's own display and inherited visibility control its contribution. Clip
  rules inherit through the definition's ancestry, not the referencing shape.
- Clip silhouettes ignore fill, stroke, stroke width and opacity. Independent
  clip-style computation avoids resolving irrelevant paint lengths, while full
  paint computation retains its overflow checks when actually requested.
- Clip-aware native raster composition and pointer containment, including
  clipped strokes, gradients and shape opacity. Geometric bounding rectangles
  remain unchanged; paint bounds and hit regions are clipped separately.
- Presentation attributes, supported CSS cascade/inline declarations and CSSOM
  updates. `clip-path` does not inherit by default; `clip-rule` does. Explicit
  inheritance does not cancel an ancestor's separately applied clip. Style
  mutations invalidate the independent clip cache.

Projected geometry and shared clip lists are cached within a projection.
Compatible opaque layers retain batching; incompatible clip regions do not
share a batch. Each clip mask is applied after layer paint/opacity and before
composition, with at most one temporary mask raster retained at a time.

## Bounds And Limitations

The existing scene ceilings remain: 4,096 preflight nodes, depth 64, 262,144
source code units, 4,096-unit fields, 512 painted shapes and 16,384 aggregate
path segments. New clip-definition shapes and transformed instances each have
a 512-shape ceiling. Same-document lookup separately scans at most 4,096 nodes
and depth 64; newly reached definitions undergo the scene preflight. Lookup,
style access, geometry, masking and compositing retain bounded/charged work.

At most 64 clip regions apply to one shape. Projected painted and clipping
geometry share the existing 65,536-point and fill/contour/edge ceilings; unique
shared clips are counted once. Raster dimensions and caller pixel/work limits
are unchanged. Empty regions do not bypass validation of later input geometry.

This is not complete SVG or CSS Masking conformance. Nested clip definitions or
clipped clip children, text/use/group clip children, percentage clip geometry,
degenerate object bounding boxes, external references, CSS basic-shape functions
and HTML clipping remain explicit unsupported paths. Active HTML `clip-path`
does not silently pass layout. Existing transform, group opacity, image sizing,
pointer-events and CSS restrictions still apply. Computed clip URLs retain the
native canonical local-fragment serialization, not full absolute-URL CSSOM
serialization. Raster clipping is binary center-sampled, not an antialiasing or
cross-browser pixel-equivalence claim.

## Focused Validation

The isolated mask kernel passes 51 tests plus strict and format checks.
The initial integrated snapshot stops at two TypeScript annotation errors;
no native tests execute in that attempt. After correcting those annotations,
the next clean snapshot passes **1,046 tests in 25 suites**, strict and format.
Its **219 new cases** comprise 48 value, 51 mask, 33 projection and 87 scene/CSS
cases. No failed attempt is discarded or relabeled as a passing run.

Evidence is under
`node_modules/.cache/native-validation/svg-clip-work-september13/`:
`kernel00/`, `scene00/` and `scene01/`. These are kernel-network-denied native
fixtures, not live browsing, credential, SafeJS or real TTY acceptance.

## Broader Native Gate

The clean selected gate passes **16,960 tests, zero failures, two unchanged
exclusions**, including the 219 new cases. Build, strict, format and source
integrity checks pass. It selects 326 suites and 325 strict roots from 704
explicit manifest entries; 378 entries are not run. The separate host-object
pressure and unsupported-display/advisory-media exclusions remain unchanged.

The gate runs from **2026-09-13T01:05:28.297Z** to
**2026-09-13T01:09:40.665Z** in
`node_modules/.cache/native-validation/native-svg-clip-september13-round01/`.
Its audit verifies 1,207 unchanged tracked inputs, 18 owned source/test files
plus the manifest, 1,226 source files and 2,048 compiled artifacts. Original
dirty work is preserved; the committed runtime blobs are checked against this
tested snapshot. No push. The preceding round00 preparation fails before any
build/test execution on an unnecessary absent-file assertion; its copied
snapshot and setup-failure record remain intact.

| Evidence | SHA256 |
| --- | --- |
| Source inventory | `653169f16a10e960aa478463c5319e3b1af03cd8c7e78aa9f2494ac520bc46d0` |
| Compiled inventory | `cf075c0211843922adf989bae0a5f962a3ef281c77c39fe64c7d4734167ae214` |
| Native results | `c1b821c4a571e3f801c3039de2eba0e6419bba912a0498373c18ef5eda305c77` |
| Gate summary | `3ab73e1a4bad593db1935c65eb4f0340e025bad2ea057f73456d3712bc010385` |
| Retained-body result | `e97f135b6c7542385d66c562e042c183a67703a7db61927278ab6c7d40f4bfe6` |

## Retained Assets

Three independent decodes of the original retained IANA, Python and SQLite
SVG bodies make zero HTTP requests and zero navigations. All three native
decoders return successfully, with unchanged work/pixel limits. IANA remains
234×72, 40 shapes, work 1,879,527; Python remains 16×16, two shapes, work 121,568.
Both retain their exact previous pixels.

SQLite now decodes **393×177**, 10 shapes, work **3,471,819**, with intrinsic
dimensions **392.0672881889764×176.5935609448819**. Its pixel SHA256 is
`928a9bf6f9143fba7e0299cd1d67b59316673a8d1a2cea1806cdb48985289f5d`.
Clipping is processed normally; no input, group clip, style issue or resource
limit is removed or waived. This advances the original asset beyond both the
fractional-dimension and clipping failures, not a complete website gate.

The capture supervisor nevertheless exits **1**: the harness incorrectly
requires at least one transparent pixel in the whole SQLite image, while its
69,561 pixels are all opaque. The individual result records `decoded:true`;
the misleading compound `sqliteDecoded:false` field, original script, result
and exit remain unchanged. The earlier sealed XML extraction records a white
fill/stroke at native node 28, consistent with an opaque background, but does
not independently prove its bounds or visual correctness. This is not relabeled
as a passed capture check or replayed merely to produce a green exit.

`svg-clip-work-september13/captured-round01/` and `CAPTURED-REVIEW.md` retain
that distinction. Decoding succeeds; SQLite visual-golden, whole-website,
script, credential and other separate acceptance gates remain unverified.

## Source Evidence

A separate sealed native-parser extraction consumes the original retained CSS
Masking response unchanged: zero HTTP requests, one parse/query owner and 65
semantic containers. The actual parser normalizes 4,979 CRLF pairs; exact
original raw spans are unavailable and are not fabricated. Verified normalized
tokenizer spans and semantic text establish the clipping rules used here.

The source is the retained August 5, 2021 CSS Masking Level 1 Candidate
Recommendation Draft, not a claim about the latest standard or every browser.
Full object-bbox degeneracy, nested reference cycles and all related SVG/CSS
algorithms remain qualification gaps where this implementation is explicit.
The previous source-adapter failure and all old bodies/measurements are retained.

`svg-clip-work-september13/masking-source/` contains the handoff, extraction,
122-entry receipt ledger and successful read-only verification. Extraction
SHA256: `2c099e02d1d4575b4b77cee302ff029349d7cbaedbc373f6243e06814e7e1bc7`.
