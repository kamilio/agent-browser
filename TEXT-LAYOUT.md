# Typography and source-mapped text lines

Later checkpoint: `DOCUMENT-LAYOUT.md` consumes this immutable relative stage to
resolve normal-flow block heights/Y positions and restricted native text painting.
Its output has absolute line/glyph Y coordinates; this API still returns relative
coordinates. Later `CLIENT-GEOMETRY.md` adds source-referenced inline fragments
and partial client rectangles. `CAPTURE-EXPORT.md` connects restricted CLI PNGs;
coordinate actions, general element captures and PDF remain open.

September 2, 2026. Text now flows from the native document through the shared CSS
cascade and formatting tree into lines measured with the actual built-in pixel
font. This is a connected layout stage, not a string-length wrapper, but remains
**block-relative text geometry, not complete page layout or screenshots**.

## Typography

`documentStyles(tree).text(id)` returns an immutable computed-subset record.
Agent `styles <target>` results expose the same record as `text`; global style
metrics and host capabilities advertise the supported property set. These style
reads still report `layout: false`: they do not themselves generate geometry.

- `font-family`: Agent Mono, or the `monospace` generic mapped to that actual
  built-in font. Other families and fallback lists are unresolved CSS diagnostics,
  not silently described as measurements of an unavailable font.
- `font-size`: supported absolute/viewport lengths, em/rem/percentages, zero and
  medium. Relative values become pixels. Root font-size rem resolves against the
  initial 16 pixels; other rem values use the computed document-root font size.
- `line-height`: normal, nonnegative unitless numbers and supported lengths or
  percentages. Unitless values remain multipliers when inherited; specified
  lengths/percentages compute to pixels at the declaring element. Normal uses
  this font's 1.25 multiplier. Zero is preserved rather than clamped to glyph ink.
- `white-space`: normal, nowrap, pre and pre-line. A small UA declaration gives
  pre elements pre whitespace. Pre-wrap/break-spaces remain unsupported.
- `text-align`: start/end/left/right/center in the current LTR profile.

All five properties inherit through actual DOM ancestry, including display:contents
ancestors. Existing selector specificity, important priority, inline values and
CSS-wide/all behavior apply. `revert` retains the pre UA declaration where
applicable. Computed records are lazily cached and share identical inherited
values; style mutations, resize and close invalidate/revoke them appropriately.

The inline declaration bridge accepts matching camelCase/hyphenated writes,
including fontSize, lineHeight, whiteSpace, fontFamily and textAlign. Invalid or
unsupported direct declaration assignments are ignored by that existing parser;
unsupported declarations in raw attributes/stylesheets still produce diagnostics.
There is no font shorthand, font loading, bold/italic face, letter/word spacing,
full UA typography sheet, general CSSOM or synthetic page getComputedStyle here.
Font-relative **box** lengths remain outside the existing box cascade.

## Connected line API

```ts
const result = layoutDocumentText(page.document);
```

The exported function first derives actual supported document block widths. Any
formatting/CSS diagnostic still rejects geometry; there is no ignore-errors mode.
It then traverses each inline-content block, including anonymous blocks created
by mixed flow and inline splitting. The later `INLINE-BOXES.md` checkpoint adds
nonzero horizontal margin/padding advances and edge-aware word grouping. General layout modes and
special/replaced controls retain the formatting stage's explicit rejection.

The immutable result has `stage: "block-relative-text-lines"`, `partial: true`,
the horizontal snapshot, measured contexts and work/output counts. Each context
contains its formatting ID, optional real block ref, content width/X, lines,
source-mapped glyphs and accumulated `textHeight`.

- Line top/baseline and glyph Y are **relative to that context's content origin**.
  Contexts have not been vertically positioned relative to other blocks.
- Glyph X includes the document-derived horizontal content position and alignment.
  Overflow and negative aligned offsets remain visible instead of being clipped.
- Each emitted glyph identifies its real source ref, ephemeral formatting ID,
  UTF-16 offset/code-unit length, character, font size, advance and visibility.
  A collapsed space points to the first contributing source sequence; discarded
  whitespace does not receive fabricated glyphs. Supplementary code points retain
  two-code-unit source locations.
- ASCII collapsible whitespace is processed across text/inline boundaries. Dynamic
  CRLF is normalized even across adjacent text nodes. Supported modes preserve or
  collapse segment breaks and spaces; pre tabs use eight-space advance stops.
- Greedy soft wrapping currently occurs at collapsible spaces only. Adjacent
  source/style boundaries do not split words. Long unbreakable words and nowrap/pre
  overflow instead of being truncated or emergency-wrapped. Nonbreaking space
  remains nonbreaking. Punctuation/UAX line breaking, soft hyphens, zero-width-space
  opportunities, justification and language-specific processing remain pending.
- Hard breaks produce forced lines, including consecutive empty lines, without
  adding an extra line after a final break. Collapsed-whitespace-only content
  produces no line. Empty inline struts contribute to occupied-line extents but
  do not publish phantom glyphs or create standalone visible content.
- Baseline/half-leading calculations use the block strut and inline ancestor/font
  extents, including mixed sizes and zero line height. Visibility-hidden text
  keeps its geometry with `visible: false`; visible descendants can override it.
- Unsupported code points keep the real source character but are measured using
  the explicit replacement glyph. Their `supported: false` values and the
  unsupported-glyph counter make fallback observable. This is not Unicode shaping,
  bidi, emoji rendering or a reference-browser glyph match.

`textHeight` is the accumulated line stack, **not the block's final used height**.
The separate document stage now resolves supported heights, vertical margin
collapse and block Y positioning. Inline decorations, backgrounds/borders,
scrolling, stacking, client rectangles, coordinate input and complete document
painting remain open. Existing semantic
actionability is unchanged. No page geometry method or screenshot/PDF command is
enabled by these intermediate coordinates.

## Limits and measurements

Lowerable `maxTokens`, `maxLines` and `maxWork` default to 250,000, 50,000 and
2,000,000. Tokens count generated glyph/tab/space/strut/break items, including some
later trimmed items; they are not synonymous with output glyphs. Existing CSS,
formatting, text-size and numeric limits also apply independently. Glyph font
sizes above 512 pixels reject layout. Zero-sized fonts retain zero advances and
remain distinct from the positive-size bitmap painter API.

Three fresh-process native profiles pass 24 assertions on 100, 1,000 and 5,000
mixed-size paragraphs. The largest has 25,005 native nodes, 25,004 formatting
records, 5,000 lines and 158,890 emitted glyphs, using 1,321,123 text-stage work
units. Single-run observations from the recorded environment:

| Rows | Parse ms | Cascade/format/width/text ms | Peak process RSS MiB |
| --- | --- | --- | --- |
| 100 | 6.3 | 12.1 | 58.1 |
| 1,000 | 30.9 | 69.8 | 98.3 |
| 5,000 | 96.5 | 245.4 | 158.1 |

These are synthetic, native-only observations, not controlled comparisons, real
website timings or proof of Worker deployment. They exclude page JavaScript,
networking and raster/PNG output. A result remains deliberately retained after
its source closes; no forced-GC or leak claim follows from these RSS samples.

## Evidence and reproduction

- `reports/text-layout-focused-2026-09-02.json`: 1,739 tests across 75 files,
  including 72 typography/line cases and 120 generated source-split/width fixtures
  compared with an independent greedy-word oracle.
- `reports/text-layout-safejs-fixture-2026-09-02.json`: twelve checks using the
  existing experimental SafeJS core, in-memory transport and actual page handlers.
  A native click changes fontSize, reflows lines and updates agent style inspection;
  text/whitespace writes, viewport units, alignment, zero leading, source fallback
  and cleanup are also checked. This is not released-SDK acceptance.
- `reports/text-layout-{formatting,css-box}-regression-2026-09-02.json`: another
  28 actual experimental-core checks.
- `reports/text-layout-panels-2026-09-02.png`: actual measured glyphs painted with
  the same font masks, visually inspected. Four contexts are **manually placed in
  demonstration panels**; this is not a page screenshot or document paint pipeline.
  The probe records its SHA-256 digest and 845,258-byte uncompressed-PNG size.
- `reports/text-layout-native-{small,medium,large}-2026-09-02.json`: the three
  native resource records described above.

From the repository root after building:

```sh
node packages/browser-agent/dist/scripts/check-text-resources.js large
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/absolute/approved/compiled/safe-js \
  node packages/browser-agent/dist/scripts/check-text-layout.js /tmp/text-panels.png
```

The interpreter probe requires an explicitly selected already-available core and
an explicit image output path. Neither probe opens a socket, starts a service or
fetches a website. No dependency was added and the default runtime was not switched.

Design references: CSS Text white-space processing, CSS 2.2 line-height and CSS
Fonts font-size rules informed this stage. The limited profile above, not those
whole specifications, describes the implemented compatibility boundary.
