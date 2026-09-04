# Native caret presentation and CSS cache ownership

September 4, 2026 continuation. This is a native in-memory cache repair, not a
completed browser, an external runtime validation or a CPU/RSS performance gate.

## Reproduced defect

The unchanged `src/styles.test.ts` regression, “keeps CSS computed values cached
through text-value edits but not relevant mutations”, failed on the preceding
`0f413bb` baseline: focused input typing returned equivalent computed CSS in a
different object. The baseline run had 37 passes and that one failure.

Native caret publication and close used ordinary root style invalidation. Those
notifications interleaved with control-value changes, so the existing eligible
text-control cache fast path could not reuse its maps. Earlier overflow-wrap and
word-wrap reports retain their original failed-test counts; this separate repair
does not relabel those historical runs as passing.

## Ownership boundary

`DocumentTree.invalidatePresentation()` still defaults to conservative style
invalidation. The explicit `"paint"` mode adds `presentationOnly: true` to the
existing `style` change record. Both modes increment the document revision and
retain the root target and style kind. Ordinary records keep their old shape.
Invalid runtime modes fail before changing the revision; closed documents still
fail before mode validation.

The bounded journal retains the marker and its ordinary overflow/reset behavior.
Listener records are frozen and returned journal entries remain independent
copies. Reentrant ordinary invalidations stay separate, untagged records. Neither
mode is a DOM mutation record or a new page-runtime API.

Only native control caret publication and close opt into paint mode here. Image,
file-control, scrolling, stylesheet and viewport callers remain conservative.
The existing method, style kind and notification timing deliberately remain in
place for caret-owner interception and pointer/focus reentrancy guards.

## Conservative reuse

`DocumentStyles` reuses its computed and related property caches only when its
revision journal is intact and every intervening change is either:

- An explicitly tagged paint-only style notification.
- An already eligible textarea or non-checkbox/radio input control mutation,
  when the owned selector compiler has no control-value dependency.

A compiled `:placeholder-shown` dependency still prevents skipping value changes.
It does not prevent skipping pure selection painting. Real style changes,
attributes, text, focus/indication, pointer/activation, other relevant mutations,
mixed relevant journals and lost history still rebuild the cascade. No computed
value equality comparison or blanket root-style suppression is used.

Document revision changes remain visible to layout and rendering, so reuse of CSS
objects does not suppress current values, selection positions or caret painting.
This change does not introduce incremental selector matching or partial recascade.

## Diagnostic counter

`DocumentStyles.metrics().cascadeBuilds` counts completed successful full cascade
builds owned by that styles instance. Its first successful access reports one;
cached access or eligible presentation changes do not increment it. Failed
resource-limited attempts do not count, including failures between successful
builds. Metrics still fail after close.

This is a deterministic native diagnostic, not elapsed time, allocation count,
RSS, a failed-attempt counter or page-runtime telemetry. Harness observations of
baseline cache-object identity are separately named and are not an invented
historical `cascadeBuilds` measurement.

## Validation evidence

The original cache regression passes unchanged after this repair. The initial
three-file run passes all 97 cases, including 19 new document notification/mode/
journal/counter cases and 40 existing atomic native selection-owner cases.
The final nineteen-file integration runs pass **585 tests in each tree**. All
**42 new cases** pass: 19 document cases and 23 cache/interaction regressions.
They cover actual typing/selection, pointer-default caret placement, textarea
vertical motion, readonly/password selection, fresh geometry/pixels, owner close,
placeholder transitions, selector-cache eviction, mixed journals, style/viewport
updates, checkedness, focus/hover/target changes, reentrancy and history reset.

The worker's unchanged baseline tests recorded 37 passes and 24 failures: all 23
new cases failed through old identity behavior or the absent counter, plus the
original cache failure. Actual production replay passed all 61 tests in that
two-file lane without changing assertions. This is not a claim of 24 independently
established baseline production defects.

Both trees pass source typechecks and builds using `--outDir dist`. Strict checks
for the new tests, scoped Biome checks and production formatting pass. Full Biome
checks on the older document/style files retain two reproduced import-order
diagnostics. Manifests match at 386 unique entries; 22 existing pending-only files
remain absent from the clean integration archive.

The actual in-memory command host produces **54 captures**, eighteen phases in
each exact `0f413bb` baseline, isolated repair and working build. All 36 cross-build
PNG comparisons are byte-identical: zero changed pixels, no masks/normalization.
Values, selections, glyph/source geometry, boxes, snapshots and paint metadata
match. All artifacts are released. The parent inspected the textarea cross-row
Shift-selection image. The pointer capture republishes the same offset; the
separate regression test covers a different-offset default caret placement.

Across 48 bounded samples (eight actions, two selector fixtures, three builds),
plain-input observed CSS object changes fall from eight to one. Seven typing/
selection/deletion actions reuse CSS; the final real style attribute rebuilds.
With a value-dependent selector, changes fall from eight to four: three value
changes and the attribute still rebuild, while four selection actions reuse CSS.
The new cascade counter increases by one and four respectively. The baseline has
no such counter. These are not timing, memory or end-to-end speedup measurements.

Evidence remains under `node_modules/.cache/native-validation/`:

- `style-presentation-baseline.log`: original unchanged regression reproduction.
- `style-presentation-integration-final-*`: populated focused JSON/log summaries,
  types/builds, strict tests and scoped formatting/linting results.
- `style-presentation-{baseline,working}-existing-biome.log`: prior diagnostics.
- `parallel-style-presentation-cache-0f413bb/delivery/README.md`: unchanged test
  baseline/replay, source fingerprints and worker delivery.
- `parallel-style-presentation-capture-0f413bb/FINAL.md` and `comparison.json`:
  commands, lineage, hashes and samples. Its initial runner-only font argument
  failure is preserved, not counted as a pass.

New archives/builds/evidence use the HOME cache because the root filesystem
remains under pressure. Pending work stays outside the focused commit; historical
evidence is neither rewritten nor deleted.

Native full-manifest execution remains unauthorized following its earlier denial;
these focused suites do not replace it. Actual SafeJS, live websites, sockets,
TTY/PTY and other original acceptance gates remain separate and open. Existing
import-order diagnostics in `document.ts` and `styles.ts` are reproduced on the
preceding committed sources and are not mixed into this cache repair.
