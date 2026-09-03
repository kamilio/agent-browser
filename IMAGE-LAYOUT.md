# Loaded PNG layout and document painting

`JPEG-DECODING.md` subsequently adds baseline/progressive JPEG resources to this
same layout and renderer. The current capability profile is
`loaded-images-normal-flow-inline-and-block`; the original PNG checkpoint below
does not imply full format, color-management or large-photo acceptance.

September 3, 2026: page-owned decoded PNGs now participate in the same normal-flow
layout, geometry, PNG screenshot and PDF renderer as document text. This is not an
image-only preview or a remote browser. It advances K08/K10 without closing their
full browser or public-site acceptance gates. No dependency is added.

## Supported profile

- A loaded `img` with inline, inline-block or ordinary block/flow-root display
  becomes a replaced formatting box. Its intrinsic dimensions come from the owned
  PNG resource, not guessed attributes or a second download. No child text context
  or synthetic glyph is created for the image.
- Auto dimensions preserve the intrinsic ratio. Authored width/height, min/max
  constraints, percentage dimensions and content-/border-box sizing resolve before
  line construction. Conflicting constraints can change the ratio. Both-auto sizing
  applies ratio-aware min/max constraints; an authored dimension is constrained
  before deriving its auto counterpart. Percentage height needs a definite
  containing height; anonymous blocks do not introduce a new percentage-height basis.
- HTML image width/height dimension hints enter below author CSS, including
  zero-specificity selectors. Explicit CSS `auto` can override them. Parsing is
  bounded to 4,096 code units; this does not implement other legacy presentation hints.
- Inline images are atomic baseline-aligned items. Their bottom margin edge sits
  on the baseline; margins/padding affect advance and line height. Normal/pre-line
  wrapping allows breaks around images, while nowrap/pre preserves unbroken flow.
  Real whitespace remains separate from zero-width image break opportunities.
- Block images use the existing horizontal auto-margin and vertical flow machinery.
  An empty replaced block does not collapse through its own margins. Image client
  rectangles describe the border box; live used styles and client/offset sizes use
  the resolved image dimensions and padding.
- The renderer draws actual decoded pixels into each content box, with nearest-
  neighbor sampling at destination pixel centers and straight-alpha source-over
  composition. Padding keeps the element background. Negative-margin image/text
  overlaps follow document paint order within this normal-flow profile.
- `visibility:hidden` retains geometry without image ink; `display:none` creates
  no image box. Source changes invalidate cached geometry and prepared captures.
  Page and element PNG exports and PDF page visuals share this renderer.
- `capabilities.imageResources` now reports layout/painting plus the explicit
  `loaded-png-normal-flow-inline-and-block` and `nearest-neighbor` profiles. The
  existing playground PNG/PDF export paths use these same native captures.

## Bounds and honest gaps

Image discovery, loading and decoding retain the limits in `IMAGE-RESOURCES.md`.
Used coordinates remain bounded by the existing layout magnitude ceiling. Text
tokens/fragments, layout work, raster dimensions/pixels and capture export limits
still apply. Painting charges clipped destination work before copying image pixels;
large offscreen images do not allocate a scaled copy. The low-level blitter copies
an aliased source buffer before writing, bounded by the existing 16 MiB raster cap.

Pending, missing, failed or unsupported image resources still cause an explicit
unsupported formatting error when visible formatting requires them. Broken-image
icons, alt-text fallback layout and HTML's full current/pending image model remain
unimplemented. Invisible boxes that still require intrinsic sizing are not exempt
from resource availability. Capture does not secretly wait for new dynamic loads.

Other formats, responsive sources/density, `object-fit`/`object-position`,
`vertical-align`, image rendering interpolation modes, EXIF orientation, animation,
color management, background images, borders, floats, flex/grid, transforms and
general stacking are not implemented by this checkpoint. PNG samples are rendered
as decoded; ignored color metadata does not become color-managed output.

PDF remains screen-layout pagination. A tall block image can be clipped across
pages, while an oversized unbroken inline line can exceed the existing pagination
profile. This is not print-layout or automatic image scaling-to-paper support.
Image alt text is not added to the PDF's text layer. No new live-site, terminal
visual, browser-comparison or Worker benchmark is claimed. The existing experimental
SafeJS core is not acceptance of the released SDK; its separate media alias-identity
failure remains open. This does not establish bot indistinguishability.

## Verification

Final validation: `reports/image-layout-focused-final-2026-09-03.json` passes all
2,745 tests across 112 explicit safe files, including 82 new cases. The eighteen
actual-core assertions pass twice in `image-layout-safejs-final-2026-09-03.json`
and `image-layout-safejs-repeat-2026-09-03.json`; eleven existing responsive/capture
checks pass in `image-layout-media-regression-2026-09-03.json`. Package build,
strict checking of four changed test files, fifteen-file lint/format checks and
package whitespace checks pass. The final post-format targeted rerun passes 89 tests.

`replaced-box.test.ts`, `raster-image.test.ts` and `image-layout.test.ts` exercise
intrinsic/min-max sizing, hint priority, percentages, box sizing, baseline/flow,
wrapping, geometry, alpha/scaling, clipping, alias-safe copying, work limits,
paint order, stale revisions, PNG pixels and actual embedded PDF RGB bytes.

`scripts/check-image-resources.ts` now runs the production loader/session/agent path
through the existing experimental SafeJS core. Eighteen assertions include guest
geometry/computed/client sizes, red-to-blue source replacement, real element and
viewport PNG transfers, exact PDF visual bytes, lifecycle and teardown. Responses
are mocked in memory; no network, socket, browser service or live website is used.
The before/after element PNGs are 19×14 and 19×16, and the PDF is 1,772 bytes. The
largest observed JSON command frame is 2,587 bytes. Reports retain byte hashes.

The first image-only test run had two incorrect pixel coordinates in overlap
assertions: AgentMono's first ink row was row 1, not row 0. Inspection confirmed
actual paint order; assertions now sample row 1, with additional earlier-ink coverage
checks. No production painting change was needed for those two fixture corrections.

The initial broad report, `image-layout-focused-2026-09-03.json`, is retained with
2,743 passing tests and two failures: the new capability test omitted its required
host factory, and an older session test still asserted that painting was unsupported.
Both test fixtures are corrected; the final broad rerun is recorded separately.

Reference models: CSS 2.2 visual formatting, replaced widths/heights and min/max
constraints (`https://www.w3.org/TR/CSS22/visudet.html`), and HTML rendering/dimension
hint rules (`https://html.spec.whatwg.org/multipage/rendering.html`,
`https://html.spec.whatwg.org/multipage/common-microsyntaxes.html`). These are design
references, not a claim of complete standards or browser-oracle conformance.
