# Bounded numeric marker primitives — September 11, 2026

## Implemented scope and API

`src/css-list.ts` admits `decimal` and `decimal-leading-zero` in the existing
list-style-type parser. Other counter systems and custom counter syntax are not
added. Existing inheritance, initial values and symbolic types are unchanged.

`src/disclosure-marker.ts` adds the agreed optional readonly `ordinal: number`
to `DisclosureMarker` and exports:

- `disclosureMarkerText(marker)`: numeric types require a safe integer, including
  zero and negative values. Decimal returns ASCII base-10 digits with an optional
  ASCII minus sign and the exact `. ` suffix. Decimal-leading-zero pads the
  numeric portion to at least two digits: `1` becomes `01. `, `-1` becomes
  `-01. `, and `-0` becomes `00. `. Safe-integer bounds limit labels to **19 code
  units**; no exponent notation, truncation or unsafe-number coercion is used.
- Valid drawable symbolic types return `undefined`. `none` remains a valid CSS
  value but is not a drawable marker and is rejected by these drawing helpers,
  as it was by the original rasterizer. Unknown types throw `unsupported`;
  malformed markers or invalid numeric ordinals throw `invalid-input`.
- `disclosureMarkerExtent(marker, fontSize)` returns a frozen width/height
  record. Symbolic width remains `fontSize`; numeric width is
  `text.length * fontSize * bitmapFont.advance / bitmapFont.unitsPerEm`.
  Both use height `fontSize * bitmapFont.ascent / bitmapFont.unitsPerEm`.
  Font sizes are finite and nonnegative, capped by the existing **512** limit.
  Zero-size layout extents are supported without glyph painting.

Numeric `rasterizeDisclosureMarker` derives font size from the supplied ascent
height and paints the exact label with the existing `paintBitmapGlyph` helper.
Digits, minus and period have no descenders in this bitmap font. The suffix
space retains its advance and remains transparent. The same captured label is
used for sizing and painting, including with a changing ordinal accessor.

Too-small supplied widths fail closed rather than clipping the label or its
suffix advance. The width comparison allows only a **1e-9 layout-unit** floating
point tolerance. Extra supplied width stays blank; it does not stretch glyphs.
Zero-font raster calls return a transparent one-pixel backing image for the
zero-sized logical extent, without calling the positive-font glyph painter.

## Raster and work boundaries

Numeric markers may span more than the old symbolic 512-pixel width, but retain
the unchanged global **4,096-per-dimension / 4,194,304-pixel** raster limits.
Rounded dimensions are checked before allocation; oversized font/ordinal
combinations also fail during extent calculation. For example, ordinal `1` at
font size 512 has a valid 1,152 × 448 extent, while the longest safe negative
ordinal at font size 288 exceeds the global width limit and is rejected.

Before allocating or painting, numeric rasterization charges:

`ceil(width) * ceil(height) * 8 + label.length * bitmapFont.glyphWidth * bitmapFont.glyphHeight`

Each zero raster dimension uses one backing pixel in that formula. Owner work
exceptions propagate without allocating or painting; no work cap is raised.
Glyph ink uses the supplied RGBA color on a transparent background, including
transparent and partially transparent ink. No new font or runtime dependency
is introduced.

The existing disc/circle/square/disclosure raster loop and its **512 × 512**
local limit remain unchanged. Ten pre-implementation pixel digests, covering
five symbolic types at integral and fractional dimensions with translucent ink,
match after the implementation; symbolic work charges are also unchanged.

## Source references and integration boundaries

Implementation references supplied by the parent are
`https://drafts.csswg.org/css-counter-styles-3/` and
`https://drafts.csswg.org/css-counter-styles-3/#decimal`.
The parent checked decimal base-10 symbols, negative sign and default period/
space suffix, and decimal-leading-zero numeric padding. These are documentation
references, **not a new native source fetch or website validation**. This worker
made no web/live request.

DOM list ownership, ordinal assignment, `start`/`reversed`/`value`, generated
formatting nodes, inside/outside placement, geometry/hit identity and document
raster integration remain parent-owned. The primitive does not implement
arbitrary CSS counters, alphabetic/Roman markers, fake DOM text, or browser/list
semantics acceptance. The archived `disclosure-markers.test.ts` includes two
decimal-unsupported cases at lines 303 and 821; those parent-owned integration
expectations were identified but not edited or suppressed in this lane.

## Guarded native evidence

Lane: `node_modules/.cache/native-validation/numeric-markers-worker-september11/`.
Clean baseline: `4ad75d8a5a2059810e64e7764d77ae294b5c4441`.
Only `src/css-list.ts`, `src/disclosure-marker.ts` and the new
`src/numeric-markers.test.ts` are overlaid. Only the new test is appended to the
archived native manifest; the shared manifest and unrelated dirty sources are
not copied or edited. No commit is created.

Selected suites are `src/numeric-markers.test.ts` (**68 tests**),
`src/bitmap-font.test.ts` (**26**) and `src/raster.test.ts` (**21**).

- `baseline-red` and `baseline-pixels`: **52 passed / 4 failed**. Both numeric
  CSS types were rejected and both numeric raster calls failed before the patch.
  The second run enables console capture for the ten native symbolic pixel
  hashes. The exact baseline test source and all failures remain preserved.
- `implementation-first`: **114 passed / 0 failed**. `strict-first` separately
  fails on one intentional malformed-input test cast; that diagnostic is
  preserved. The cast was corrected through `unknown`, without weakening checks.
- `regressions-second` and `tests-final`: **115 passed / 0 failed**, including
  a label-stability regression; strict compilation passes with no diagnostics.
- Final checks on September 11, 2026: tests **18:04:32.204–18:04:33.503 UTC**,
  strict no-emit compilation **18:04:33.540–18:04:34.267 UTC**, existing Biome
  formatting **18:04:34.304–18:04:34.340 UTC**; all exit zero.

Coverage includes safe-integer extremes, signs/negative zero/padding, literal
digit/minus/period pixels, suffix spacing, fractional metrics, color/alpha,
zero font size, width/font/global boundaries, invalid inputs, exact owner work
admission and rejection before allocation, and unchanged symbolic pixels.

The reused native guards, socket-denying tool-child seccomp and single-thread
Vitest configuration use private HOME/TMP, ignored stdin, stripped environment,
120-second timeout plus 5-second kill grace, and 6 MiB output/file caps. Native
addon/SafeJS loading is denied by the reused guard. Final source-before/after
inventories are identical; all child process groups are absent and no cap or
stream failures occurred. No sockets, credentials, TTY/devices or live work were
used. `AUDIT.json`, `source-final.sha256`, `scoped-final.patch` and
`RECEIPTS.sha256` retain clean isolation, tested source pins and exact paths.
