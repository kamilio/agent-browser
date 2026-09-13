# Native text-decoration thickness

The native browser supports `text-decoration-thickness` and the thickness
component of `text-decoration`. This is real stroke-width rendering, not only
acceptance of `underline 1px` or suppression of an unsupported-value diagnostic.
The earlier `TEXT-DECORATION.md` retains its original Level 3 scope and evidence;
this document describes the subsequent thickness feature.

## Style behavior

- The longhand is non-inherited and initially `auto`. Explicit `inherit` copies
  the parent's computed thickness; `initial`, `unset` and `revert` reset it.
- `auto`, `from-font`, `thin`, `medium`, `thick`, signed finite lengths,
  percentages and the existing bounded `calc`/`min`/`max`/`clamp` subset parse.
  Nonzero unitless numbers, malformed math and duplicate shorthand widths fail.
- Absolute, font-relative and viewport-relative lengths compute to pixels.
  Percentages and percentage terms in mixed math remain relative. `em` uses the
  decorating element's font, `rem` the root font and `ex` the actual native glyph
  x-height, not an assumed half-em.
- Shorthand order is line, thickness, style, color; omission resets thickness
  to `auto`. Six top-level components are supported when three line types,
  thickness, solid style and color are combined. Balanced function tokens count
  as components, not whitespace-delimited pieces.
- Inline and computed CSSOM expose named and generic thickness accessors.
  Shorthand serialization omits an automatic thickness, preserving existing
  three-component strings. Other widths serialize between line and style.
  Priority, removal, CSS-wide values, `all`, variables and mutation invalidation
  use the existing declaration/cascade machinery.

## Painting and bounds

Explicit lengths/percentages resolve against the decorating font, round to the
nearest native device pixel and have a one-pixel minimum. Negative and zero
computed values remain visible through CSSOM but use that minimum for painting.
The existing finite-length and raster-work limits run before pixel work; an
oversized value cannot become an unbounded drawing loop.

Automatic thickness keeps the existing Agent Mono policy, font size / 16,
including its fractional behavior. The font exposes no preferred underline-width
metric, so `from-font` uses that same fallback. Native `thin`, `medium` and `thick`
widths are 1, 3 and 5 pixels. These are renderer choices in its current single-
device-pixel profile, not a universal font or device-pixel-ratio guarantee.

A decoration retains its originating thickness across descendant font changes;
a descendant can separately establish another line. Existing propagation,
clipping, alpha blending, ink skipping, glyph ordering and stroke positions stay
intact. Thickness does not add layout boxes, move the underline offset, change
hit regions or make the glyph geometry larger. Unchanged automatic decoration
rasters remain covered by the existing tests.

The feature does not add underline-offset/position controls, non-solid styles,
downloaded fonts, vertical text, skip-ink controls or generated-pseudo decoration
rendering. Existing unsupported-profile guards remain. The editor draft's
unfinished line-position averaging section is not implemented or claimed.

## Source and validation

`DECORATION-THICKNESS-SOURCES-SEPTEMBER-13.md` compares the actual May 4, 2022
published draft and August 17, 2026 editor draft retrieved by the native browser.
It preserves their percentage-table inconsistency, different rounding wording,
selected-section limits and exact source hashes. No latest-edition assumption
or other browser engine substitutes for those observations.

Two new suites contain **105 cases**: 60 style/CSSOM and 45 real raster cases.
The corrected focused tests produce **639 passes / 108 failures** on the old
runtime and **747 passes / zero failures** with thickness implemented. All 105
new cases fail on the baseline; three updated existing expectations also reflect
the newly four-component shorthand/style. All existing 80 decoration-style
cases remain; obsolete rejection examples become duplicate-width/division-zero
rejections rather than being deleted.

Initial `fixed00` preserves two test-assumption errors: treating the font's
x-height as half an em and expecting a false result instead of a resource-limit
exception at excessive value nesting. `fixed01` corrects those expectations
without changing production. Baseline and fixed build, strict compilation and
format checks pass. A separate read-only parser/cascade review found no concrete
defect within its scope; that is not a substitute for executed tests.

Focused evidence: `node_modules/.cache/native-validation/decoration-thickness-work-september13/`,
`baseline01/` and `fixed01/`. Its 64 absolute-path receipt entries have ledger
SHA-256 `f17c1a220a0d3be6a4c54e9193fa84ac8f8b3979483127f2582a8b814fea09a5`.
All initial attempts and historical sources remain untouched.

## Final native and page gates

The final native run on **September 13, 16:44:47.451–16:49:24.665 UTC** passes
**20,177 tests / zero failures / two unchanged skips**. Build, strict compilation,
formatting and immutable-source checks pass. It selects 392 suites / 391 strict
roots from 754 explicit manifest entries; 362 entries remain unselected.
The increase of 217 passing cases includes 105 new cases and 112 previously
unselected inline-priority, document-paint and outline cases, not 217 new tests.

The two prior exclusions remain the separate host-object-ceiling case and the
unsupported-display case. No native pass proves live-site, device, socket, TTY
or SafeJS acceptance. The audit binds 1,295 source/config files, 2,124 compiled
files and 1,285 unchanged tracked inputs, with pre-existing declaration/computed-
style/style rearrangements excluded from the candidate and preserved locally.

Runtime: `node_modules/.cache/native-validation/native-decoration-thickness-september13-round00/snapshot01/dist`.
Audit base: `0f33cf85b0b342338a1ecccb64210e72a484dae2`.

- Audit SHA-256: `31ea78a854cb139b6eeb370edc7e671b77d6a3b4375f3bcf30a458eeeb3b30ad`.
- Source ledger: `3e4c454470fcfd394a42950b9f67aa88937043010a26401355818a5424306ab6`.
- Compiled ledger: `135b47b134ccac7024b8247f55afdab05c0bd0c931dc13ba9a2670515abbfd07`.
- Native results: `4872d44fc20e8d7dc4f621c7084ce627006b01db8e1c82373327ea27e6fc3a57`.

The exact eight-resource Python replay reduces applicable value errors from
two to one and preserves all nine applicable property errors. The real Tutorial
click still fails; no destination fallback, fresh Python request or full-page
raster success is claimed. See `PYTHON-DECORATION-THICKNESS-REPLAY-SEPTEMBER-13.md`.
