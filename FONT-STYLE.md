# Native font-style

The native engine accepts author `font-style: normal | italic | oblique`.
The property starts at `normal`, inherits, and participates in the existing
stylesheet/inline cascade, custom properties, CSS-wide keywords, CSSOM aliases,
computed-property enumeration and mutation invalidation. Parsing is bounded to
4096 input units. A later valid `normal` descendant removes an inherited slant.

## Actual painting

Agent Mono still supplies only its existing regular and bold bitmap faces.
Italic and oblique requests use the same **synthetic oblique** treatment, not a
newly installed or separately designed italic face. For native face matching,
`italic` is treated as a synonym for `oblique`; the authored computed keyword
remains distinct. The native horizontal profile
shears bitmap ink rightwards by 14 degrees above the alphabetic baseline; ink
below the baseline can extend leftwards. The chosen pivot is a native rendering
decision, not a claim that every font or browser uses that pivot.

The painter samples the transformed cells at pixel centers, preserves alpha
compositing, clips to raster bounds, and keeps the original normal-style path.
Conservative transformed ink bounds prevent rejecting visible slanted overhang
just because the upright glyph would be outside a screenshot clip. Logical
advances, ascent, descent, x-height, line breaking, hit regions and client
rectangles stay unchanged for this synthetic native profile. Ink is not a new
layout box or scroll extent.

Document text, regular/bold glyphs, textual controls, file-button labels, image
alternatives and textual list markers receive the style. Geometric checkboxes,
radio controls and disclosure triangles do not become slanted text. Image
alternative crops account for both upper right and descender left overhang.
The existing control/marker raster rectangles still bound their visible output.

Underline/overline ink skipping projects the descendant's slanted bitmap cells
into each decoration band; line-through remains continuous over glyphs. The
existing per-glyph skip-ink scope, box propagation and originating decoration
font/color rules remain. This is not full modern `text-decoration-skip-ink`
support or a claim of cross-glyph ink exclusion. Slanted painting and bounded
decoration interval sorting are charged to existing work owners.

## Deliberate limits

- No explicit oblique angles, `left`/`right` values, font shorthand, vertical
  writing, downloaded fonts, installed-system-font probing or real italic face.
- No new UA defaults for `i`, `em`, `cite`, `dfn`, `var` or `address` in this
  change. Author CSS must request the supported style.
- `font-synthesis` and `font-synthesis-style` remain unsupported and diagnosed.
  Do not interpret this feature as honoring `none` or `oblique-only`; applicable
  unsupported declarations retain the existing guarded rendering behavior.
- A native rendering pass is not live-site, credential, passkey-device, SafeJS,
  real-TTY, browser-fingerprint or challenge-handoff acceptance.

## Validation and provenance

Focused isolated validation passes 966 tests across 23 selected files, including
127 new cases: 42 CSS, 41 core/document raster, and 44 consumer cases. Strict
type checking, formatting and source immutability checks pass. The first run
preserves one test-fixture failure: an invalid zero font size was rejected before
the intentionally invalid style. The corrected test uses a valid size and still
checks transparent/blank input validation. No production behavior was weakened.

The first broader run preserves two failures in tests that still expected
`font-style:italic` to be unsupported. The original media and keyword fixtures
remain unchanged; updated assertions verify real slanted pixels, unchanged
geometry and the unrelated invalid-print-style diagnostic. Other unsupported
property/value guards remain tested. No new exclusion was added.

The clean broader rerun passes **17503 tests, zero failures, two unchanged
exclusions**, across 340 selected files and 339 strict roots. Its explicit
manifest contains 718 entries, of which 378 were not run by this gate. Build,
strict, formatting and source checks pass. The audit binds 1246 source files,
2072 compiled files and 1232 unchanged tracked inputs to the selected clean
snapshot, not the unrelated dirty working tree. Gate time: September 13, 2026,
03:52:00.561–03:56:05.124 UTC; audit: 03:56:05.233 UTC.

The original SQLite HTML/CSS offline replay passes with raw unsupported-property
diagnostics **18→15** and applicable diagnostics **12→11**. Six selector issues,
eleven float flags and one overflow flag remain; float flags alone do not prove
a missing float engine. No invalid-CSS-value diagnostic remains. The bounded
element census finds 179 computed-normal and two computed-italic elements, not
two proven visible glyph runs. Family selection, x-heights, box samples, DOM and
post-install presentation remain stable; owners close and runtime hashes match.
This replay performs one parse, one stylesheet installation, four native selector
queries and one formatting call, with no HTTP, images, used layout, raster or
scripts. It is not whole-site acceptance. Its source bodies are unchanged from
the original SQLite capture.

Primary-source work uses native parsing of the retained CSS Fonts 4 body from
September 11, 2026, not a fresh HTTP retrieval. The first bounded extraction
verified default/inheritance and synthesis controls but exhausted its container
selection on WPT links before observing the default-angle prose. That partial
evidence stays preserved. A separately scoped narrowed native extraction observes
the unqualified-oblique default of 14 degrees and the conditional permission for
artificial obliquing. It also verifies the important distinction: treating italic
and oblique as synonyms for matching permits this approach, whereas an agent
treating their matching distinctly must not synthesize for italic. The retained
source does not mandate a 14-degree angle for a real italic face. The new native
profile explicitly takes the synonym-matching route and preserves the computed
keyword. Whole qualifying clauses and native DOM references remain in the source
handoff; no new HTTP retrieval is claimed.

Evidence lanes under `node_modules/.cache/native-validation/`:

- `font-style-work-september13/fixed00`, `fixed01` and `fixed02` — focused runs.
- `native-font-style-september13-round00` — preserved broader failure.
- `native-font-style-september13-round01` — broader selected native rerun.
- `font-style-work-september13/sqlite-replay00` — original-source offline replay.
- `font-style-source-september13` and `font-style-source-september13-followup01`
  — retained-source evidence, with distinct scopes and receipts.

No runtime dependency was added. Pre-existing dirty work remains separate.
