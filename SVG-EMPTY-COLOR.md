# Empty SVG presentation color

The native SVG presentation adapter ignores a `color` attribute whose existing
trim operation produces an empty value. It contributes no color declaration,
so inherited color and author CSS continue to determine `currentColor` paint.
The original document and attributes are not rewritten.

The attribute's 4,096-unit source limit and work charge still apply before this
omission. Nonempty unsupported colors, declaration injection and invalid width
or height remain rejected. No other presentation-property admission changes.

`src/svg-empty-color.test.ts` supplies 17 native cases covering empty/whitespace
values, dimensions and immutable results, rasterized inherited/author color,
attribute mutation, malformed color/geometry and resource limits. The isolated
candidate passes 872 tests in 13 selected files; the original runtime passes five
and fails twelve of the new cases. Build, selected types, format and lint pass.

The concrete motivating page is the complete Target response captured on
September 17, 2026. Its SVG node 207 has `color=""`, which previously aborted
native layout. Reusing that unchanged response now completes native navigation.
One separately scoped native GET retrieves its declared cross-origin classic
script asset with the existing CSP/CORS checks, without evaluating it.

This is not general invalid-SVG recovery, actual SafeJS execution, a fresh Target
homepage navigation, a hydrated storefront, shopping interaction or a new
100-site success rate. See `reports/svg-empty-color-2026-09-17.md` for evidence
and preserved failed attempts.
