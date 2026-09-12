# Native SVG CSS fill paint

Native SVG fill now uses the CSS cascade rather than reading paint attributes
as a separate rendering path. This extends both standalone SVG images and inline
SVG scenes without adding a runtime dependency or executing page scripts.

## Supported behavior

- `fill`: supported CSS colors, `none`, `currentColor`, and same-document
  `url(#Fragment)` paint references with an optional color or `none` fallback.
- `fill-opacity`: numbers and percentages, clamped to [0,1]. The computed value
  inherits; it is not multiplied again at every ancestor. Color alpha and shape
  opacity are combined with it during painting.
- `fill-rule`: inherited `nonzero` and `evenodd`, with actual winding behavior
  in the existing native rasterizer.
- Presentation attributes enter the existing native author cascade at zero
  specificity. Author rules, inline declarations, importance, custom properties,
  CSS-wide resets and mutation invalidation use the existing style owners.
- Paint-server fragment IDs retain their case through stylesheet, inline-style
  and CSSOM parsing. Gradient selection does not flatten real gradients into a
  fallback color or accidentally lowercase their IDs.
- Missing or invalid local references use the explicit fallback, or paint
  nothing when no fallback exists. The first duplicate ID remains authoritative.
  A valid but unsupported paint-server type still raises `unsupported`; its
  fallback is not a license to substitute for unimplemented rendering.
- Animation `fill` modes are not interpreted as CSS paint attributes. Unsupported
  presentation paint is checked when painting/accessing that element, avoiding
  an eager failure from a nonpainted `display:none` subtree. A supported winning
  CSS declaration can replace an unsupported presentation value.

Default fill is black, opacity one and rule nonzero. Internal optional defaults
remain compact, preserving existing paint-object reuse. Computed styles expose
the new properties; scene and image paths consume the same computed paint.

## Boundaries

This is not complete SVG/CSS support. External paint-server URLs, URL escape/base
resolution beyond local fragments, context paint, radial gradients, patterns,
strokes, clipping/masks/filters, fractional intrinsic sizing and group-opacity
compositing remain separate gaps. Local fill values and their canonical forms
are limited to 4,096 code units. Existing scene/image/work limits are unchanged.
Unsupported CSS diagnostics are not suppressed and stylesheets are not removed.

The previous SQLite banner still needs stroke/clipping and fractional-sizing
work. Successful IANA/Python image loading does not imply complete page layout.
Neither this feature nor native regression tests establish authenticated,
passkey-device, SafeJS, challenge-bypass or broad website acceptance.

## Source evidence

Two native-only W3C acquisitions on September 12, 2026 capture SVG2 painting and
styling. Their exact native extracts establish paint grammar, fallback/no-paint
behavior, defaults/inheritance, winding rules, opacity clamping and animation
attribute distinctions. Evidence and a read-only verifier are retained in
`node_modules/.cache/native-validation/website-svg-work-september12/svg-css-paint-source/`.

The source's opacity prose permits percentages despite its table saying N/A.
The captured presentation-order wording is ambiguous for zero-specificity ties;
the existing native cascade ordering is not redesigned here. Detailed CSS-wide,
currentColor and absolute-URL conformance remain broader source/implementation
gates, not claims inferred from a green native test. An unrelated capped DOM
interface excerpt remains omitted rather than fabricated.

## Validation

The final clean candidate passes **16,496 native cases, zero failures and two
unchanged exclusions**, including 91 new cases in three files. It selects 318
suites and 317 strict roots from 696 manifest entries; 378 other entries were
not run. Build, strict checking, formatting and source stability pass. The final
focused gate passes 552 cases. Pre-existing uncommitted work remains excluded.

Final gate: September 12, 2026, **23:31:24.888–23:35:18.914 UTC**;
audit: **23:35:29.421 UTC**. Evidence:
`node_modules/.cache/native-validation/native-svg-css-paint-september12-round01/`.
It verifies 1,214 source files, 2,032 compiled artifacts, 1,200 unchanged tracked
inputs and the 13 owned source/test files, plus the explicit manifest.

- Source inventory SHA256: `b4de070ae73b1702c460289bb3977d327b28d02629002e35f565ab7950ac3b2e`.
- Compiled inventory: `f798e12a5aa43f2387c07e0feb7a5468ef9412918f91b8b6afa21445d0b84656`.
- Native results: `f86fe7d698145f4125045e880a64908d77e8e0c4870dd45866fd5e2cb03fa753`.

Three independent captured-body checks at **23:35:50.337–23:35:50.419 UTC**
make zero HTTP requests/navigation attempts. IANA's 234×72, 40-shape SVG and
Python's 16×16, two-shape SVG retain byte-identical pixel hashes relative to the
earlier native decoder. Work counts are now 1,874,351 and 121,235 respectively;
the old measurements remain unchanged. SQLite still stops at the native SVG
style-profile guard. This is not a new website pass or visual-browser comparison.
Private decoder DOM cleanup is covered by native tests, not independently
instrumented in these captured-body checks.

Earlier focused failures, a snapshot-merge setup failure and the passing but
superseded 16,491-case candidate retain their original evidence. Existing negative
fixtures that used newly supported fill/missing-reference behavior now exercise
still-unsupported stroke/context paint; positive fallback/no-paint cases cover
the new behavior. Unsupported guard coverage is not simply deleted.
