# Native physical rounded corners — September 13, 2026

The native engine now connects physical CSS corner radii to computed styles,
formatting, background and border painting, replaced-content clipping, and hit
testing. This extends `ROUNDED-GEOMETRY-PAINT.md`; that earlier foundation report
retains its original measurements and does not become a website acceptance run.

## Supported profile

- `border-radius` accepts one to four horizontal radii and an optional slash
  followed by one to four vertical radii. The four physical longhands accept
  one or two values. CSS-wide keywords, variables, cascade, `all`, live inline
  declarations and read-only computed declarations use the same registry.
- Radii are noninherited unless explicitly inherited. Computed percentages
  remain percentages; used horizontal and vertical values reference the box's
  own border-box width and height. Existing native length/math/font-unit rules
  apply. A border shorthand does not reset radii.
- Shared outer ellipses normalize all eight components together. Padding and
  content curves subtract the respective insets without renormalizing the inner
  curve. Either zero component makes that corner square.
- Solid, dashed and groove borders paint the actual outer-minus-inner ring.
  `none` and `hidden`, unequal widths/colors, alpha, exclusion rectangles and
  raster crops retain bounded behavior. Solid/groove side classification is
  constant-cost per covered pixel; dashed paths use 32 segments per corner with
  explicitly charged perimeter sampling. Groove shading follows the middle
  inset curve. The engine samples pixel centers without antialiasing.
- Backgrounds use the outer curve. Decoded replaced images, native control
  rasters, image alternatives and embedded SVG use the content curve. Ordinary
  descendant overflow is not unconditionally clipped by an ancestor's radius.
- Hit testing shares the curves, including a rounded owner's own text regions
  and SVG shape regions. Root scroll and fixed-position coordinate conventions
  remain unchanged. The existing half-open span boundary policy still applies;
  exact zero-width ellipse tangencies are not a positive-width hit span.
- Equal-height LTR inline fragments decorate a hypothetical concatenated box
  before slicing. Middle fragments do not receive four fresh corners, and dash
  phase is not offset twice. Generated content has its own noninherited radius.
- Flex, grid, inline-block and table display decomposition retain the metadata.
  Separate table borders honor radii; collapsed table borders ignore them.

## Explicit limits

`box-decoration-break: clone`, unequal-height rounded inline slices, and rounded
fieldsets with rendered legends are not supported. Clone remains an unsupported
CSS property/value rather than being silently treated as slice. Unequal-height
slices fail explicitly at geometry preparation; fieldsets retain a formatting
diagnostic. Existing unsupported overflow, background-image, border-image,
transform, bidi and other layout profiles are not newly admitted by this change.

Parsing support is not a promise that an otherwise unsupported page can lay out,
paint or receive a genuine click. Native controls are not evidence of OS-native
appearance, real device access, passkey acceptance or a SafeJS session.

## Validation

The focused isolated snapshot `radius-integration-work-september13/fixed02`
passed **887 tests, zero failures, zero skips** on September 13, 2026,
23:14:40.774–23:14:59.753 UTC. This comprises 184 new cases and 703 unchanged
adjacent cases across 21 explicitly selected files. Production compilation,
strict test compilation, formatting, and before/after source integrity passed.
New cases cover CSS values/CSSOM, borders, page pixels/hits, inline images, SVG,
display decomposition, generated boxes, mutation/close behavior, and slices.

The broader isolated native gate passed **21,517 tests, zero failures, and two
unchanged skips** across 419 selected files on September 13, 2026,
23:16:29.388–23:21:28.820 UTC. It uses 418 strict test roots and the explicit
773-entry manifest; 354 manifest files were not selected. The two skips concern
the separate host-object ceiling and advisory-media fallback. They remain skips,
not newly passed acceptance gates. Compilation, strict tests, formatting, and
source/runtime inventory checks passed: 1,321 source and 2,152 compiled files,
with 1,303 unchanged tracked inputs.

Gate: `native-radius-integration-september13-round00`; AUDIT SHA-256
`8f5b92b3f90ec240cda1f21a9604ae7718a8226b35331d3bd5e458da497c6572`;
20-entry receipt ledger SHA-256
`4d9f8053bbe6b87138bc6385c6a90e29b0b4f2bce3a70e574042875e7ee26ac1`.
No live website request, credential/provider/device, SafeJS, real TTY or socket
acceptance is established by either native test gate.

The first focused run exposed missing computed-property registration and radius
metadata on deferred table/flex/grid boxes. A separate read-only review found
missing inline-replaced content curves and doubled dashed-slice phase. These
were corrected, and dedicated regressions cover them. One test's exact tangent
expectation was adjusted to the already-documented half-open geometry policy;
the production geometry was not changed to conceal that boundary behavior.

Release preparation preserves the four pre-existing CSS import/category reorder
residuals separately. The native snapshot and staged feature contain only owned
changes, not those residuals or the pre-existing manifest/TASKS edits.

## Primary-source provenance

Rules are based on source pages previously read through this repository's native
browser: CSS Backgrounds and Borders Level 3 returned the March 11, 2024 CRD,
and CSS Fragmentation Level 3 returned the December 4, 2018 CR. These are the
returned dated editions, not a claim to have verified the latest editions.
See `ROUNDED-FRAGMENT-SOURCE-SEPTEMBER-13.md` and the sealed native source lanes.
The exact corner color partition and bounded dashed approximation are native
rendering policies, not claims that the source mandates those algorithms.
