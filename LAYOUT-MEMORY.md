# Single-vector painting with complete lazy glyph snapshots

September 2, 2026. Native painting, capture and client-rectangle extraction no
longer eagerly allocate both relative and absolute records for every glyph.
The engine still exposes both coordinate views. No limits, supported content,
source references, snapshot fields or PNG pixels were removed to obtain the
allocation reduction. No dependency or external renderer was added.

## Change

`layoutDocumentText()` continues to produce the original immutable relative
glyph vectors. `layoutDocument()` validates every translated glyph coordinate
and all existing work/numeric limits before returning, but defers nonempty
absolute vectors until a caller reads `context.glyphs`.

- The first read materializes a complete frozen array of complete frozen glyph
  records. Later reads return the same array. All original own glyph fields are
  retained, including source offsets, characters, flags, positions and advances.
- The `glyphs` property is an enumerable readonly accessor for nonempty contexts.
  Object spread and JSON serialization still include all absolute glyph data;
  they intentionally trigger materialization rather than silently omitting it.
- Empty contexts retain cheap eager frozen empty vectors instead of gaining an
  unnecessary lazy-reader closure.
- A data-only reader factory owns the source vector, vertical offset and cached
  result. After materialization it releases its own source-vector reference.
  It does not depend on a live document, style resolver or layout-state map.
- Source snapshots remain relative and unchanged. Saved positioned snapshots can
  still materialize after document mutation or close. Layout metrics remain the
  original validated snapshot; materialization does not rerun layout.

The rasterizer reads the existing relative vector and applies `contentY` when
painting each glyph. Its positioned line boxes and inline-fragment geometry are
unchanged. Element capture still uses one layout pass and shares rectangle
extraction with page/agent geometry. Nothing about session or artifact ownership
changes.

This optimization targets consumers that need painting or rectangle geometry,
not a materialized copy of every absolute glyph record. Consumers requesting
full absolute snapshots still pay that one-time copy cost. This is not a promise
that serializing an entire document layout uses half as much memory.

## Deterministic allocation evidence

The 5,000-paragraph offscreen-capture fixture contains 158,890 glyphs in 5,000
nonempty text contexts. A native-only `Object.freeze` counter records glyph-shaped
records and their nonempty vectors without retaining those objects. The original
implementation was measured before editing; compiled layout/raster module hashes
are included in the reports.

| Stage | Frozen glyph records | Nonempty glyph vectors |
| --- | ---: | ---: |
| Original capture path | 317,780 | 10,000 |
| Optimized capture path | 158,890 | 5,000 |
| Optimized path after explicitly reading every absolute vector | 317,780 | 10,000 |

`layout-memory-eager-allocations-2026-09-02.json` and
`layout-memory-final-allocations-2026-09-02.json` each pass six assertions.
The counter is restored in `finally`. These are allocation-shape checks, not
timing, heap-retention, website or SDK benchmarks. They prove that the capture
path avoids 158,890 duplicate glyph records while preserving complete inspection
data when requested. The native target PNG remains exactly the same 179 bytes.

## Resource observations

The same fresh-process fixtures from `INLINE-CAPTURES.md` were run without the
counter or forced garbage collection. Every profile still passes seven checks
and produces the identical 24 × 8 offscreen target PNG.

| Paragraphs | Original peak RSS | Optimized peak RSS | Original layout/crop | Optimized layout/crop |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 63.8 MiB | 64.1 MiB | 19.14 ms | 19.55 ms |
| 1,000 | 106.0 MiB | 110.3 MiB | 103.96 ms | 94.72 ms |
| 5,000 | 199.4 MiB | 175.4 MiB | 339.83 ms | 313.55 ms |

The large sample's observed peak drops by about 24 MiB. RSS does **not** fall in
every smaller sample, and none of these single local measurements establishes a
statistical speedup, universal memory reduction or Worker acceptance. The large
sample still uses substantial memory. Full-document layout and the remaining
relative glyph representation remain optimization work.

Original reports are `inline-capture-native-{small,medium,large}-2026-09-02.json`;
current reports are `layout-memory-final-{small,medium,large}-2026-09-02.json`.
An intermediate lazy-reader experiment is retained in `layout-memory-lazy-allocations`
and `layout-memory-native-*` reports; those are not the final resource figures.

## Regression evidence

- `layout-memory-focused-2026-09-02.json`: 2,090 passing tests across 92 explicitly
  selected safe files. Nine new tests cover allocation timing, per-context/stable
  materialization, complete JSON/spread fields, immutable/empty vectors, eager
  bounds, post-close snapshots and single-vector painting/geometry.
- `layout-memory-geometry-regression-2026-09-02.json`: all 13 existing experimental
  SafeJS geometry checks pass.
- `layout-memory-capture-regression-2026-09-02.json`: all nine existing experimental
  core capture-export checks pass. Its large PNG remains byte-identical to the
  previous compressed export.
- `layout-memory-inline-regression-2026-09-02.json`: all 11 interpreted inline
  capture checks pass, including geometry changes, independent decoded pixels,
  private file output and old-snapshot stability. Its PNG matches the earlier
  visually inspected inline fixture byte for byte.

Build, strict changed-test typechecking, focused formatting/lint and diff checks
pass. The core remains the existing explicitly selected experimental SafeJS build;
this does not accept a newly released SDK or establish new live-site/frontend
compatibility. The full browser goal remains active.

Reproduce after building:

```sh
node packages/browser-agent/dist/scripts/check-layout-allocations.js lazy 5000
node packages/browser-agent/dist/scripts/check-inline-capture-resources.js large
```

The probe's `eager` argument is an assertion for the recorded pre-change
implementation, not a switch that changes current runtime behavior. Running it
against the optimized implementation should fail its eager-allocation assertion.
