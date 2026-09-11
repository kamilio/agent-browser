# Native font weight and bitmap faces

Authored `font-weight` is a text property in the native Agent Mono profile. Its
computed weight is distinct from the available face chosen for painting. The
implementation has no system-font lookup, web-font fetching, variable-font
engine, external shaping dependency or browser delegation.

## CSS computation

The supported core values are `normal`, `bold`, numbers from1 through1000
inclusive, `bolder`, `lighter`, and the existing CSS-wide text keywords. Numeric
values may be fractional. Specified normal/bold keywords stay keywords in native
inline style serialization; computed values expose400/700. Relative values use
the inherited computed number, not the face selected to paint the parent.

The relative mapping follows the native primary-source table in
`FONT-WEIGHT-SOURCE.md`. In particular, lighter below100 preserves the inherited
number, and bolder at900 or above preserves it. Values are not rounded to a
multiple of100. Invalid values retain applicable CSS diagnostics; support for
normal does not discard invalid declarations or unrelated formatting gates.

## Available faces

`bitmapFont.weights` is a frozen400/700 face list. `bitmapGlyph(character, weight)`
and the final optional weight argument of `paintBitmapGlyph()` accept those
registered face weights, defaulting to400. Other face identifiers reject. This
low-level API does not interpret an arbitrary CSS computed weight.

The regular face retains its original masks and metrics. The bold face is a
distinct built-in design, generated once with bounded rightward emboldening
inside the same5-by8 cells. Glyph rows, ink bounds, fallback glyphs and maps have
bounded immutable contents. Both faces use the same6-unit advance,7-unit ascent,
1-unit descent and8-unit em. No caller-driven glyph cache or per-call font
allocation is added.

For these two eligible faces, requested weights up to500 select400; greater
than500 select700. This is static CSS font matching, not nearest-distance
rounding:500.1 selects700 while400.1 selects400. The requested computed value is
still preserved in style APIs. Missing custom fonts and arbitrary font-width or
font-style combinations are not introduced by this mapping.

## Painting and boundaries

Body text, native control captions, and inside/outside numeric list markers use
the selected face. Ink clipping uses that face's actual bounds; glyph advances,
selection geometry and caret metrics remain monospace. Geometric markers keep
their existing shapes. Existing raster, text, source and work bounds remain.

`styles.metrics().textFontWeights` reports available faces. This is not a claim
that every numeric weight has a distinct font or that the family is variable.
The registered bold face is not an implementation of author-controlled
`font-synthesis-weight`. Font shorthand, unsupported math/value forms, font
downloads, UA heading/b/strong defaults and a full platform font system remain
outside this change. Native host tests do not establish SafeJS runtime or device
font acceptance.

## Validation status

The isolated old production baseline reaches the width-profile guard on a
genuine checkbox click with authored normal weight. An isolated bitmap-leaf
gate passes117 checks across four manifest-selected suites, with no exclusions.
Integration, broad release and website acceptance gates are still pending at
this checkpoint; the new OpenBSD destination replay is separate from the earlier
successful live FAQ-to-introduction flow.

The subsequent integration gate passes1121 checks across25 manifest-selected
suites with one existing exclusion. It includes195 new tests of syntax,
inheritance, face selection, exact pixels, control captions, numeric markers,
native inline/computed style serialization, clipping, limits and the genuine
checkbox regression. Six initial integration failures were test expectations:
the old text-property count and a new fixture's incorrect glyph-array location;
they are retained in the private validation sequence, not excluded from the gate.

The sealed release at
`node_modules/.cache/native-validation/native-font-weight-september11-round01/`
passes build, strict compilation, configured formatting and11025 native checks,
with two unchanged exclusions. It selects189 suites and188 strict test roots
from586 clean manifest entries. The gate runs from23:23:23.437 to23:25:43.152 UTC
on September11,2026, with stable1075 source files and1916 compiled files;
1061 tracked inputs are unchanged and two dirty production residuals are excluded
and verified intact. This is not a pass of every repository test or a live-site
interaction gate. The captured introduction baseline separately reveals one
float and three overflow blockers; supporting font weight does not suppress them.
