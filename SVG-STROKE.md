# Native SVG stroke paint

The standalone native renderer supports bounded SVG strokes without Chromium,
Firefox, a remote browser, page scripts, or new runtime dependencies.

## Supported behavior

- CSS and SVG presentation attributes: `stroke`, `stroke-width`,
  `stroke-opacity`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`.
- Inherited values, CSS-wide keywords, author/inline cascade, computed values,
  mutation invalidation, solid colors, `currentColor`, and case-sensitive local
  linear-gradient references with missing/invalid-reference fallback paint.
- Nonnegative unitless, px, absolute-unit and percentage widths. Absolute units
  compute to px. Percentages stay unresolved until projection supplies the actual
  SVG viewport; the normalized diagonal is used, with viewBox user coordinates
  when present. Preferred CSS root dimensions are not substituted for used sizes.
- Butt, round and square caps; miter, round and bevel joins; nonnegative miter
  limits including values below one. Exceeding the limit bevels the join.
- Open/closed paths and degenerate drawn subpaths. Move-only paths paint nothing;
  zero-length drawn paths receive round/square caps. All-zero square subpaths use
  a horizontal fallback tangent, not a claim of complete path-direction support.
- Local-coordinate stroke outlines transformed through the full affine matrix,
  including nonuniform scaling, skew and reflection.
- One nonzero-winding paint over the union of stroke polygons, avoiding repeated
  translucent overdraw at joins/caps. Fill paints before stroke. Individual shape
  `opacity` attributes composite the combined fill/stroke once; group opacity is
  separate. This does not establish complete SVG CSS opacity support.
- Stroke-only hit targets and stroke extents, while retaining geometric path
  bounds for existing client-rectangle APIs and normal SVG viewport clipping.

## Bounds and exclusions

The existing work owner and scene/path/raster limits remain in force. Outline
construction is bounded to 16,384 contours, 65,536 points and coordinate magnitude
1e9; projected fill plus stroke also share the 65,536-point budget. Round outlines
use bounded sagitta subdivision. Precision loss or budget exhaustion fails
explicitly rather than silently degrading geometry or increasing caps.

Dashes, markers, clipping paths, masks, filters, non-scaling stroke, arbitrary
paint order, miter-clip/arcs joins, group opacity, relative/math stroke widths,
external paint servers, radial gradients and patterns remain unsupported. The
existing SVG pointer-events subset is not a complete SVG pointer-events model.
Standalone fractional intrinsic image sizing is a separate acceptance gate.

## Validation and provenance

The clean selected native gate passes **16,711 tests, zero failures, two unchanged
exclusions**, including **215 new cases**: 64 outline, 45 projection/hit/raster,
and 106 CSS/cascade/scene cases. The focused run passes 1,006 cases across 24 suites.
The broad gate selects 321 suites and 320 strict roots from 699 explicit manifest
entries; 378 manifest entries are not run. Build, strict type checking, formatting
and source stability checks pass. The exclusions remain the separate total-host-
object pressure case and unsupported-display/advisory-media case.

The UTC receipts run from **2026-09-13T00:04:56.459Z** through
**2026-09-13T00:08:50.860Z**. The lane retains its September 12 creation name:
`node_modules/.cache/native-validation/native-svg-stroke-september12-round00/`.
It contains the clean snapshot, explicit selected config, native guard, build/
strict/format/native results, audit and source/compiled inventories. The audit
checks 1,201 unchanged tracked inputs, 17 owned source/test files plus the
manifest, 1,219 source files and 2,040 compiled artifacts. Pre-existing dirty
source-order changes remain excluded and preserved. The post-commit verification
checks the actual committed runtime blobs against the tested snapshot; no push.

| Evidence | SHA256 |
| --- | --- |
| Source inventory | `f02f2607fb1d9b16ce668b8eb6c52b34a7b6b377d281b33e30ef3371ab2b4b05` |
| Compiled inventory | `b5b7c7d63c5f4dd35298851fed34a91c034cebf8940412241d05b9b30c380200` |
| Native results | `4ae48d0190deb4fd85628d2eb81e9ae75ed1c066e10cae85e76d1dc020dc47c7` |
| Gate summary | `dac3109a75fda3026d6da4c421c2aacdba4af33b20b3b019209c39d6c14a5123` |
| Retained-body result | `4d5019694e26b8c846705e8c6b0240da5294ca3f48b557ebc6704aad11436e02` |

Three independent retained-body decodes make **zero HTTP requests and zero
navigations** under kernel network denial. IANA remains 234×72 with 40 shapes,
work 1,879,482; Python remains 16×16 with two shapes, work 121,559. Their exact
pixel hashes match the prior retained results. SQLite advances past the SVG CSS
profile guard but fails with `SVG image requires positive integer intrinsic
dimensions`, before scene construction. Its real clipping requirement remains
separate; neither SQLite image rendering nor whole-site acceptance is claimed.
These receipts are in `svg-stroke-work-september12/captured-round00/` under the
same validation cache. Decode owner limits are unchanged, returned rasters are
released, the child exits normally and private HOME/TMP directories are empty.

`outline00` and `scene00` preserve format-gate failures after successful strict
checks, with no native execution. `outline01` and `scene01` contain the passing
focused runs. Static review found malformed CSS numeric-token acceptance and
preferred-versus-used viewport confusion; both have explicit regressions in the
final passing candidate. No failed attempt or historical evidence is rewritten.

The primary-source review parses the exact retained W3C SVG2 painting response
once with the native parser under network denial: zero HTTP requests, 78 complete
containers. Its sealed handoff and explicit specification/dependency gaps are at
`node_modules/.cache/native-validation/svg-stroke-work-september12/primary-source/HANDOFF.md`.
The retained source establishes current-viewport percentage dependence but does
not independently establish the linked normalized-diagonal units formula,
path-direction fallback, bounding-box policy or numeric approximation tolerance.
