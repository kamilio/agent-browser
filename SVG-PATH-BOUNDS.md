# Native analytic SVG path bounds

`src/svg-path-bounds.ts` exports `svgPathBounds(path, transform, charge)` using
the scene's `SvgMatrix` and `SvgBounds` types. It returns a detached, frozen
`{ x, y, width, height }`, or `null` for empty/move-only paths. Drawing segments
of zero length retain point bounds, including coincident-endpoint arcs. Moves
are not drawn. Connected subpaths and explicit closing endpoints are validated.

Lines use transformed endpoints. Quadratic and cubic Bezier curves use
transformed controls, normalized derivative roots, and de Casteljau evaluation
at interior extrema, not control hulls or sampled polylines. Arcs correct radii
and construct transformed ellipse cosine/sine bases. Only endpoints and axis
extrema inside the selected sweep contribute. Singular/reflected transforms,
negative radii, zero-radius lines and rotated ellipses are supported.

Arc extent follows the existing flattening implementation's normalized chord
strategy, not subtraction of endpoint angles. Sweep membership is measured
around the arc midpoint (or the complementary short gap for large arcs).
Extremum values are evaluated relative to the chord midpoint with a rationalized
radius/projection difference and sagitta; this avoids subtracting nearly equal
center/radius values for tiny chords. Large/small and forward/reverse choices
remain distinct for near-coincident endpoints.

## Resource and precision contract

- Existing flattening/affine limits are reused, not raised: 16,384 segments,
  coordinates/radii/rotation and matrix entries of magnitude at most 1e9.
  Transformed controls, centers, basis components and extrema must also fit.
  Width/height are differences of bounded coordinates and can reach 2e9.
- Work is charged before matrix validation (8), each segment read (1), its
  bounded validation/analytic work (256), and result allocation (4). There is
  no subdivision, recursive geometry traversal or input-dependent inner loop.
  The initial segment count fixes iteration even if the owner appends inputs.
  Owner exceptions propagate without interception or partial results.
- Malformed inputs throw `invalid-input`; resource overflow, unresolved arc
  normalization/underflow, affine product/derivative underflow, and ambiguous
  near-zero cubic discriminants throw
  `resource-limit`. Corrected radii beyond existing ceilings are rejected.
  Calculations use binary64, not arbitrary precision or certified interval
  arithmetic. Ordinary floating-point rounding remains; unresolvable tiny
  sagitta is rejected rather than silently dropping a known extremum.
- These are centerline/fill-path geometry bounds, not stroke, clipping, filter,
  marker, text, CSS layout or browser `getBBox()` implementation. They are not
  a proof of rendering or hit-testing integration.

## Validation scope

The private `node_modules/.cache/native-validation/svg-bounds-worker-september11/`
lane validates a clean `17c0e99a5d324c49185663167012a64f4001a2e9` snapshot,
overlaid only with this module/test/document and the parent's scene types and
affine helper. Only this new test is appended to the snapshot native manifest;
the working manifest and `TASKS.md` are untouched. The lane reuses sealed-exec
and native network guards for targeted tests, strict TypeScript and formatting.
Source/result hashes and command receipts live in that lane. No network,
browser, SafeJS, credential, device or live-site acceptance is claimed.
