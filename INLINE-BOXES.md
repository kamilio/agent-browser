# Inline margin and padding layout

The independent text engine now lays out horizontal inline margins and padding
instead of rejecting every nonzero edge. Text positions, wrapping, client
rectangles, computed styles, native painting and element PNG captures share the
same results. No dependency, browser engine, SafeJS patch or live service was added.

## Behavior

- LTR inline opening and closing edges advance the text cursor. Pixel and
  percentage margins/padding resolve against the containing block's content
  width. Automatic horizontal inline margins resolve to zero. Signed margins
  can move text backwards or overlap adjacent content; margins do not collapse.
- The first fragment receives the left margin/padding and the last receives the
  right margin/padding. Soft-wrapped continuation fragments do not repeat those
  edges. Formatting splits around in-flow blocks apply the same first/last rule;
  client rectangle queries for block-in-inline splits still fail explicitly.
- Client rectangles include padding but exclude the inline's own margins.
  Parent inline bounds account for descendant margin advances without expanding
  to all descendant overflow. Positions remain signed; reported widths are
  nonnegative even when negative margins reverse the accumulated advance.
- An empty inline with nonzero edges participates in line layout and can paint
  a real background without inventing text glyphs. A zero-edge empty inline
  retains its zero-width geometry anchor without a phantom line.
- Normal, nowrap and preformatted whitespace retain their existing distinctions.
  Closing padding stays attached to its preceding word when selecting a line,
  including when collapsible whitespace precedes the closing tag. On an unbroken
  line that space remains inside the closing edge; at a break it is removed.
- `getComputedStyle()` now reports the actual used horizontal inline margins and
  padding, including percentages, auto margins and signed values. Saved style
  declarations and newly queried rectangles update after real script mutations.

The line builder groups words with their closing edges before committing them
to a line. It materializes positions after deciding whether the intervening gap
is present. This avoids charging a space outside its inline or placing a word
before discovering that its closing padding does not fit. Edge tokens, fragment
ancestry, measurement and positioning all consume existing bounded work budgets.

## Painting and capture

Inline backgrounds now use actual layout fragments instead of independently
reconstructing rectangles from glyph ancestry. This includes empty padded boxes,
first/last horizontal padding and the correct exclusion of margin areas.
Within each line, fragments paint in formatting-tree order so parents precede
children and later siblings retain their order when signed margins overlap.
The order table is a bounded typed array. Existing foreground painting, clipping,
RGBA8 blending and single-vector glyph allocation remain in use.

Element PNG capture continues to crop the document, not isolate/reflow the
element. Overlapping content can therefore appear in a capture, and gaps between
wrapped fragments retain the underlying page pixels rather than being filled
with the element background.

## Evidence

Reports are timestamped at their actual UTC execution time:

- `inline-box-focused-2026-09-03.json`: 2,128 passing tests across 94 safe files,
  including 19 new edge/layout/geometry/paint/capture cases. The old assertion
  rejecting horizontal padding is replaced by a still-unsupported border case.
  Package build, strict changed-test type checks, focused lint, all nine touched
  code/manifest formatting checks and diff whitespace checks pass.
- `inline-box-safejs-2026-09-03.json` and
  `inline-box-safejs-final-2026-09-03.json`: nine checks each through production
  PageScripts and the existing explicitly selected experimental SafeJS core.
  Interpreted edge writes change native geometry, saved computed styles and later
  captures; old rectangle snapshots do not change. Native PNG inflation verifies
  every emitted scanline, and every capture pixel matches the viewport crop.
- `inline-box-native-2026-09-03.png`: a visually inspected 15 × 18 capture of two
  padded text fragments. Its 236 bytes have SHA-256
  `c03a0055f9430adafc193a7461ab1fc7218e597f4c2d74bf7f3816bdb8fa1834`.
  Decoded RGBA SHA-256 is
  `d0d60c152c4e3c8d3647caec475293cc0d18d2efc0dd228366456655515fa341`.
- `inline-box-computed-regression-2026-09-03.json` and
  `inline-box-geometry-regression-2026-09-03.json`: 13 existing actual-core checks
  each, without substituting mock guest execution.
- `inline-box-allocation-regression-2026-09-03.json`: six deterministic checks.
  The 5,000-row capture still creates one relative glyph vector: 158,890 records,
  not 317,780. Explicit full absolute inspection still materializes the complete
  second vector. The original 179-byte BETA target PNG digest is unchanged.
- `inline-box-resource-large-2026-09-03.json`: seven native resource checks on
  the same large capture fixture. This sample takes about 350 ms to render versus
  the prior layout-memory sample's 314 ms; peak RSS is about 173.3 MiB versus
  175.4 MiB. Extra edge handling is not a speed improvement. Single local samples
  are not a statistical benchmark or low-memory Worker acceptance.

All new probes use in-memory HTML, not live websites or sockets. The actual-core
checks do not establish released-SDK acceptance. Existing public-site evidence
is separate and has not been replaced with a claim based on these fixtures.

## Remaining scope

This is the current LTR normal-flow margin/padding profile, not a full CSS inline
formatting engine. Borders, bidi/reordering, vertical writing, decoration cloning,
atomic inline/replaced controls, floats, positioned layout, general UAX line
breaking and full browser conformance remain open. Unsupported formatting/CSS
still fails before publishing fabricated geometry. The original object, node,
token, line, fragment, coordinate, raster and work limits have not been raised;
new edge tokens count toward them, so near-limit input can exhaust its budget
earlier than it did without edge processing.

Primary references inspected for this work: CSS 2.2 inline formatting contexts
and the inline box model, at `https://www.w3.org/TR/CSS22/visuren.html#inline-formatting`
and `https://www.w3.org/TR/CSS22/box.html#bidi-box-model`. The tests cover the
implemented profile; they are not a full web-platform conformance run.
