# Native solid text decoration

Author CSS can specify text-decoration and its line/style/color longhands. The
native renderer paints underline, overline and line-through, including combined
lines. It does not merely accept text-decoration:none and erase diagnostics.

## Style and propagation

- Line/style/color are non-inherited computed properties. Explicit inherit works;
  initial/unset reset. The shorthand resets omitted components to none, solid and
  currentcolor. Existing cascade priority and custom-property substitution apply.
- Applied decorations propagate through the formatting tree independently of
  computed inheritance. A descendant's none does not cancel an ancestor's line.
- Originating color and font metrics survive descendant color/font changes. Each
  decorating element can add its own lines. Atomic inline contents and out-of-flow
  descendants do not receive ancestor decorations; they can establish their own.
- Ordinary block descendants receive propagated decorations. Descendant visibility
  and relative positioning affect applied lines along with their text.
- Internal whitespace is decorated; line-leading/trailing spacing is skipped.
  Decorating inline margins/borders/padding are skipped, whereas those belonging
  to descendant inline boxes are included. Wrapped fragments retain edge slicing.

The actual available native font is Agent Mono. Native line thickness is font
size / 16, and the underline starts that distance below the alphabetic baseline.
Overlines use the native ascent and strike-through uses the native x-height's
midpoint. These are this renderer's choices, not universal CSS formulas. Underline
and overline positions use the decorating font rather than each descendant font.

Underline and overline precede glyph ink; strike-through follows it. The native
bitmap masks interrupt underline/overline near glyph ink, with a thickness-sized
horizontal clearance. Strike-through stays continuous. This is a native Level 3
ink-skipping policy, not support for the Level 4 text-decoration-skip-ink property.

Line painting uses existing clipping, alpha blending and bounded raster work.
Decorations add ink, not layout boxes, hit regions or scrollable overflow. Pages
without active decorations do not allocate decoration traversal/paint state.
Owner maps are bounded by formatting/layout inputs and released after rendering;
style caches participate in normal mutation invalidation and document closure.

## Limits

The supported style is solid. Double, dotted, dashed, wavy, blink, thickness and
underline-position controls, vertical writing, emphasis and text shadows are not
introduced by this change. Unsupported declarations continue to be reported.
No UA link/u/s/del/ins defaults are added here: this is author-CSS support, not a
claim of complete browser-default styling. No font downloads, runtime dependency,
Chromium, Firefox or remote browser is used.

## Primary source

The native browser retrieved the W3C CSS Text Decoration Module Level 3 document
on September 13, 2026, with one HTTP 200 GET and no redirects or challenge. The
served document is the May 5, 2022 Candidate Recommendation Draft, not a claimed
2026 edition. A separate sealed native parse extracted the relevant clauses.
Evidence: node_modules/.cache/native-validation/native-text-decoration-source-september13/.

That source establishes box-tree propagation, ancestor-line preservation, edge
handling, color/style origin, painting order and ink-overflow behavior. It leaves
exact line placement/thickness to the UA and permits ink skipping. It does not
establish a modern skip-ink property default or full rendering acceptance.

## Validation — September 13, 2026

Clean selected native gate: **17,376 passed, zero failed, two unchanged
exclusions**, across337 suites and336 strict roots. Of715 explicit manifest
entries,378 were not run. Build, strict types, formatting and immutable-input
checks pass. The audit binds1242 source files,2068 compiled files and1231
unchanged tracked inputs. Evidence:
`node_modules/.cache/native-validation/native-text-decoration-september13-round00/`.

New cases total113:80 style/cascade cases,31 raster/propagation cases and two
canonical baseline cases. The original none/underline failures now pass with
unchanged fixture bytes, actual pixels and unchanged geometry/hit testing.
Focused validation passes490 cases across14 suites. A preparation-only import
conflict is preserved separately; no native tests ran in that failed setup.

The original retained SQLite replay passes with applicable unsupported-property
diagnostics15→12 and raw diagnostics24→18. Six selector issues, eleven float
flags and one overflow flag remain; CSS-value issues stay absent. This replay
does not perform HTTP, image decoding, used layout, raster or scripts, and does
not establish whole-site acceptance. Source DOM, post-install presentation and
runtime hashes remain stable; all owners close.

Replay00 failed an overstrict expectation that confused a partial stylesheet scan
with applicable diagnostics. Replay01 checks the actual categories and passes.
Its sealed scope prose also misstated the old raw count; a separate erratum
corrects that without rewriting historical receipts. Evidence and correction:
`node_modules/.cache/native-validation/text-decoration-work-september13/sqlite-replay01/`
and `node_modules/.cache/native-validation/text-decoration-work-september13/SQLITE-REPLAY-COUNTS.md`.
