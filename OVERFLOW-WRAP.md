# Native overflow wrapping

September 4, 2026 continuation from `1e23e7f`. Ordinary document inline text now
supports inherited `overflow-wrap: normal | anywhere | break-word`. This is
bounded native layout progress, not full CSS text, font, runtime or browser parity.

## Behavior

Regular whitespace opportunities retain priority. An oversized word moves after
an available ordinary break before it is split across emergency opportunities.
`anywhere` contributes those opportunities to min-content sizing; `break-word`
does not. Neither changes max-content. `white-space: pre` and `nowrap` prohibit
emergency splitting in their text; common-ancestor white-space controls boundaries
between inline text nodes. At such boundaries this implementation accepts either
adjacent text run's emergency policy after the common-ancestor wrapping check.
The CSS level leaves overflow-wrap style choice across those boundaries undefined.

Grapheme clusters remain together, including combining marks across text nodes
and joined emoji. A cluster wider than its line may overflow rather than being
split or producing an empty preceding line. No hyphen or synthetic source glyph
is inserted. Original node refs, code-unit offsets and character identity feed
the existing placed layout, inline fragments, hit testing and Range rectangles.
Pre-wrap spaces and explicit line breaks retain their existing behavior.

`normal` stays the default. The existing CSS-wide keywords, declaration cascade,
importance, supports queries, immutable inherited style sharing, mutation
invalidation and live computed `overflowWrap` metadata use their existing paths.
`word-wrap` alias support remains absent; this is not full property conformance.
Native software controls retain their separate fixed widget wrapping policy.

## Implementation and bounds

- `src/css-text.ts` adds the inherited longhand, normal default and keyword parser.
- `src/text-layout.ts` keeps the normal word path, then packs grapheme-safe groups
  only when emergency wrapping is relevant. Inline opening edges move with the
  following text and final closing edges participate in last-group fitting.
- `src/text-grapheme-boundaries.ts` returns fresh numeric boundary Sets. Printable
  ASCII uses a direct path; other text uses a lazily cached native host
  `Intl.Segmenter` with grapheme granularity. No page-runtime API or dependency is
  introduced. Unsupported non-ASCII host segmentation fails explicitly rather
  than silently splitting by code point; ASCII remains available without it.
- Helper input is capped at 500,000 UTF-16 units. Work is charged before traversal
  or Set allocation, then for each boundary/segment step. The implementation keeps
  only the segmenter, not input strings or iterator results. Returned Sets do not
  share state with later calls.
- Existing 250,000-token, 50,000-line, 250,000-fragment and 2,000,000-work limits
  still apply. Word grouping, boundary traversal, ancestor checks, prediction and
  publication charge the existing work ledger. Intrinsic and used layout share
  this code instead of creating another line-breaking implementation.

Native segmentation is a host operation, not a preemptible CPU deadline. This
continuation does not measure ICU-version parity, retained memory, CPU/RSS or
page-runtime cost. General shaping, bidi, word-break, line-break, hyphenation and
keyboard grapheme editing remain separate gaps.

## Tests and static checks

Integration archive:
`node_modules/.cache/native-validation/overflow-wrap-integrated.aYqwPT`.
All new snapshots, builds, logs and images use the home filesystem, not the
space-constrained root filesystem. Existing evidence is preserved.

The three new files contain **138 cases**:

- `src/css-overflow-wrap.test.ts`: 42 metadata/cascade/supports cases.
- `src/text-grapheme-boundaries.test.ts`: 73 Unicode, bounds, charging and host
  availability cases.
- `src/overflow-wrap-layout.test.ts`: 23 layout/intrinsic/inline/Range/hit/resource
  cases, including 96 ASCII word-priority oracle comparisons within one test.

The explicit **24-file** final regression run reports **939 passes and one
unchanged baseline failure** in the isolated archive, and **940 passes and that
same failure** in the working tree. It is not a fully green regression suite.
All new cases pass. The retained failure is `src/styles.test.ts`,
“keeps CSS computed values cached through text-value edits but not relevant
mutations”; it is independently reproduced against exact `1e23e7f` before these
production changes. No unrelated cache behavior is patched to hide it.

Both project no-emit checks and builds using `--outDir dist` pass. Strict checking
of the three new tests and scoped Biome over seven files pass. The two existing
computed-style counts increase from 72 to 73; the text-longhand `all` count
increases from five to six. Existing pending computed-style tests and other
working changes remain outside the focused commit. Both manifests retain
**382 unique entries**, with 22 pending working tests absent from the archive.

Final logs use
`node_modules/.cache/native-validation/overflow-wrap-integration-final-v2-`.
Earlier evidence remains intact:

- The initial direct baseline rejected all twelve cases at the unsupported CSS
  formatting gate, including an explicit normal declaration. It is not evidence
  of twelve separate line-breaking bugs.
- The CSS worker's five-file baseline reports 181 passes / 32 failures; after
  metadata integration it reports 209 passes / four failures. Three are the
  updated longhand-count expectations; the fourth is the retained cache failure.
- The first 137-case integration passes. Formatting later truncates a literal
  joined-emoji fixture, and the first broader run catches that damaged fixture
  plus the baseline cache failure. The preserved formatter diff demonstrates
  the lost code points. Explicit Unicode escapes restore the intended cluster;
  the extra oracle case and final runs validate the formatted source.
- Initial broader preflight finds three proposed files exist only in pending
  working edits and executes no tests. The actual common explicit set is the
  24-file list, not a full-manifest or broadly filtered substitute run.

Worker reports are under `parallel-css-overflow-wrap-1e23e7f/delivery/README.md`
and `parallel-text-grapheme-boundaries-1e23e7f/report.md` in the same cache.

## Geometry and capture evidence

The `overflow-wrap-default-before`, `after` and `working` JSON files contain
**180 unchanged default-policy layouts and work counters**, byte-identical across
the committed baseline, integrated and working builds. The comparison covers
text contexts and work metrics, not the new computed-property metadata. It
isolates the normal word-path refactor; it is not a timing benchmark.

`parallel-overflow-wrap-capture-1e23e7f/FINAL.md` and `comparison.json` record thirty
actual injected-native host screenshots across ten cases and three builds.
The visual baseline is **`1e23e7f` plus CSS metadata acceptance only**, not the
exact committed baseline or an earlier release: otherwise strict layout rejects
the unknown property before any same-HTML capture can be taken.

Three default/normal/nowrap controls remain byte-identical. Seven reflow cases
change 10,964 pixels, all within the union of actual before/after source-glyph
and inline-fragment rectangles, without enlarged paragraph masks. Long words,
ordinary-space priority, decorated inline fragments, preserved whitespace and
width mutation behave as asserted. Source HTML/text, accessibility output and
glyph identity remain unchanged; wrapping correctly changes line geometry.
All ten working PNGs match integrated images byte-for-byte. Each artifact is
exported/deleted and the final artifact list is empty. Long-word and decorated
inline captures were visually inspected by the parent as well as the sidecar.

These are ASCII native paint fixtures with fixed-height sample boxes, not Unicode
font/shaping, general page reflow or live-site evidence. Full native-suite,
SafeJS, actual website/socket/terminal/service-process and original seven-day
browser acceptance gates remain open. The until-stopped goal remains active.

## Primary references

Reviewed September 4, 2026: CSS Text Level 3, sections 5.4–5.5, and ECMAScript
Internationalization Segmenter semantics. Native host Segmenter availability is
observed locally; cross-runtime/ICU equivalence is not inferred from the specs.

```text
https://www.w3.org/TR/css-text-3/#overflow-wrap-property
https://www.w3.org/TR/2026/CRD-css-text-3-20260814/#overflow-wrap-property
https://tc39.es/ecma402/2025/#segmenter-objects
```
