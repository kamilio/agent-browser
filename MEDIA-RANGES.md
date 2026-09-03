# Compiled responsive media conditions

The September 3 checkpoint replaces the flat media-feature matcher with a bounded
compiler shared by CSS stylesheets and page `matchMedia`. Page media lists retain
their compiled predicate and evaluate it against the live viewport, instead of
reparsing their query string on every getter and resize notification. No dependency,
external engine, network access or default SafeJS runtime change is introduced.

## Implemented profile

- Width, height, aspect-ratio and resolution support Boolean queries, colon values,
  min/max prefixes, equality, `<`, `<=`, `>` and `>=` comparisons.
- Reversed comparisons and consistently directed chained bounds are supported,
  including `(40px < width <= 800px)` and `(800px >= width > 40px)`.
- Parenthesized `and`, `or` and `not` conditions nest. Mixed `and`/`or` chains
  require grouping; a media-type clause cannot have an ungrouped top-level `or`.
  Existing `all`, `screen`, `print`, `only`, `not` and comma-list handling remains.
- Width/height accept finite decimal/exponent numbers with px, em, rem, in, cm,
  mm, q, pt and pc, plus unitless zero. Relative font units use the initial 16px
  font, not authored CSS. Negative bounds participate in numeric comparisons.
- Aspect ratios accept finite nonnegative numerators and positive denominators,
  or a bare number with implicit denominator 1. Zero denominators are unsupported.
- Resolution uses this renderer's fixed one output pixel per CSS pixel, not the
  host machine's display. dppx, x, dpi, dpcm and the `infinite` query value are
  supported. The current screen-layout PDF path still uses the same environment.
- Orientation remains portrait for square/tall viewports and landscape otherwise.

The compiler builds bounded native predicates only; query text is never evaluated
as JavaScript. Its frozen result exposes normalized media text, an unsupported flag,
a compilation condition count and a reusable `matches(viewport)` function. Page
list ownership, event scheduling, listener identity and close behavior remain as
documented in `MEDIA-QUERIES.md`.

## Limits and deliberate gaps

Input is bounded to 65,536 UTF-16 units per native compilation, 32 delimiter
levels and 1,024 counted conditions/media-type branches. Existing page limits are
stricter where applicable: 4,096 input units per list, 256 lists and 65,536 retained
serialized units. Excessive input rejects with `resource-limit`; there is no
unbounded recursive parse, global query cache or new background task.

This is not full Media Queries Level 4 conformance. Unknown features/media types,
preference and pointer capabilities, viewport-relative/font-metric units, calc/var,
escaped identifiers, quoted/general-enclosed syntax and zero-denominator ratios
remain unsupported. Unsupported branches are conservatively represented as
`not all`; unknown features do not receive general three-valued Boolean semantics.
Malformed delimiter or quote structure invalidates the whole compiled list. Other valid
comma alternatives survive individually unsupported branches. These boundaries are
tested, not silently counted as browser-equivalent parsing. Commas inside quotes,
escaped text or nested delimiters cannot manufacture matching list alternatives;
comment markers inside quotes do not consume subsequent valid alternatives.

Normalization preserves the engine's existing inspection serialization, not every
canonical CSSOM formatting rule. Native stylesheet diagnostics still expose
unsupported queries and prevent unsupported layout/capture acceptance. The native
`matches` API expects an engine-style numeric viewport; it is not a new viewport
validation or emulation API.

## Evidence

- `src/css-media.test.ts`: 87 cases for comparisons, inclusive/exclusive edges,
  reversed/chained ranges, negative bounds, numeric units, ratios, resolution,
  grouping, unsupported syntax, nesting/source/condition quotas, 10,000 repeated
  compiled evaluations and actual native CSS paint selected by complex conditions.
- `reports/media-ranges-focused-final-2026-09-03.json`: all 2,405 tests pass
  across 104 explicitly selected safe files. Package build, strict changed-test
  checks, lint, formatting and whitespace checks also pass.
- `reports/media-ranges-commands-safejs-final-2026-09-03.json`: eleven passing assertions
  through actual agent commands and the existing experimental SafeJS core, using
  chained/grouped conditions in both the stylesheet and interpreted media list.
  Guarded resize fires real callbacks, updates snapshots and chunked native PNGs,
  and restoring the viewport/content restores identical PNG bytes. Frame sizes
  stay at or below 1,348 bytes in that run. No network or live sockets are used.
- `reports/media-query-resources-final-2026-09-03.json`: five passing native resource
  assertions. On the same 20,000-evaluation fixture, reusing one compiled query
  takes 3.876 ms; compiling on every evaluation takes 102.140 ms. Both match exactly
  10,000 viewports. Process maximum RSS is 61,288 KiB across both passes. Earlier
  pre-delimiter-regression reports remain retained rather than overwritten.
- `reports/media-ranges-alias-regression-2026-09-03.json`: thirteen behavior
  assertions pass, but the separate global/Window function-identity assertion
  still fails on the experimental core. The probe remains overall false and exits 1.

The timing sample compares two **current native APIs**, not old and new browser
versions. The reuse pass excludes its one setup compilation; the other includes
20,000 compilations. It is a single uncontrolled local sample, not a browser-wide
speedup claim, a released-SDK benchmark or a Worker/realm memory guarantee.

The separate experimental-core global/Window function-alias identity failure is
not fixed by this compiler. Real-site, live visual, released-SDK and full Kitesurf
acceptance remain open; the larger goal stays active.

Reference: https://www.w3.org/TR/mediaqueries-4/ (February 19, 2026 draft).
