# Bounded native SVG path parsing

`src/svg-path.ts` exports `parseSvgPath(source, charge, limits?)`, `SvgPathLimits`
and frozen `svgPathLimits`. It imports the parent's unchanged `SvgPoint` and
`SvgPathSegment` definitions from `src/svg-path-types.ts` and re-exports those
types. This is a native TypeScript parser, not page script execution.

## Supported parsing

- Absolute and relative M/L/H/V/C/S/Q/T/A/Z commands, repeated parameter groups,
  implicit lineto after moveto, and absolute normalized points.
- Cubic and quadratic smooth-control reflection only after the matching curve
  family, resetting after other commands and subpath changes.
- Multiple subpaths and closepath restoring the current point to the subpath's
  initial point. A non-moveto command after closepath draws from that restored
  point; consumers must start a new subpath there when processing the segment
  following a close. No synthetic moveto is inserted.
- ASCII signed decimals and scientific notation, compact sign/decimal boundaries,
  optional comma/space separators, and exact adjacent 0/1 arc flags. Whitespace
  means space, tab, CR or LF, not arbitrary Unicode or form feed.
- Arcs retain radii, rotation in degrees and boolean flags. Negative radii become
  absolute. Zero-radius and identical-endpoint arcs remain arc records: consumers
  handle line degeneration and omission respectively, along with radius correction
  and rotation interpretation. The parser does not replace curves with fake lines.

All outputs, segments and nested points are frozen. Caller limit objects are not
mutated or frozen. Empty/ASCII-whitespace-only paths return a frozen empty array.
Malformed or incomplete input throws `SyntaxError`; no partially parsed output is
returned. This deliberately differs from SVG partial-error rendering.

## Resource and numeric bounds

Defaults are also hard ceilings; overrides may only lower them and must be finite,
positive safe integers. An explicitly undefined field uses its default.

| Limit | Default / ceiling |
| --- | ---: |
| `maxSourceCodeUnits` | 262144 |
| `maxSegments` | 16384 |
| `maxCoordinate` | 1000000000 |

Every numeric token (including radii and rotation), absolute endpoint and control
point is finite and within the coordinate-magnitude bound. Relative sums and
reflected controls are checked, not clamped; with the hard coordinate ceiling,
intermediate addition/reflection remains safely below the integer precision limit.
Fractional values use JavaScript finite-number precision, including underflow to
zero; negative zero is normalized. Invalid limits and exceeded bounds throw
`RangeError`. Raising the ceilings is not supported.

The owner callback is charged before bounded work: one unit at entry,
`4 * source.length + 8` before scanning/initial output allocation, 16 units before
each segment's scans/point allocations, and `2 * token.length + 1` before each
numeric substring allocation/conversion. The source-length check precedes any
length-based scan charge. Segment admission precedes point/segment allocation.
Parsing is iterative and linear in bounded source length plus segment count,
without whole-source token arrays or backtracking regular expressions. Charges
are deterministic accounting units, not timing or byte measurements. Owner
exceptions propagate unchanged, including during empty-path admission.

## Validation scope

Focused tests cover every command, compact grammar, malformed separators,
reflections/reset, multiple subpaths, flags/negative and degenerate radii, bounds,
immutable output, owner exhaustion and long/degenerate inputs. Validation uses an
isolated `ddf4aad0fbd69e3fbb5e5b06c18ff3505615bc09` snapshot with only this parser,
its test, this document and the parent's types overlaid. Only the parser test is
added to that snapshot's native manifest. Receipts and exact commands live in
`node_modules/.cache/native-validation/svg-path-worker-september11/`.

The parent supplied already-read official SVG2 path/implementation guidance,
including absolute normalization of negative arc radii. This worker makes no
standards-conformance claim and performs no network research or live validation.
Parser success is not flattening, rasterization, SVG layout/painting, browser or
website success. Those integration/acceptance gates remain parent-owned; this
worker does not edit `TASKS.md` or the working-tree native manifest.
