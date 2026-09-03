# Native CSS colors and solid backgrounds

`BACKGROUNDS.md` extends this stage with solid-color/none background shorthand,
eight-component resets and live inline/computed CSSOM. Its non-color components
are restricted to initial values and CSS-wide keywords; images remain unsupported.

The subsequent `CAPTURE-EXPORT.md` checkpoint connects this native renderer to
CLI PNG files and playground capture actions. Evidence below describes the original
paint-stage workload; full CSS and public-site acceptance remain open.

The normal-flow document renderer now consumes a shared color cascade instead of
hardcoding black text. It paints real document-positioned glyphs, solid block and
inline backgrounds, and a propagated HTML canvas background. This is a restricted
native renderer, **not full browser screenshot compatibility**.

No dependency, browser engine, remote rendering service or default SafeJS runtime
has been added or changed. The runtime probe uses the existing experimental core,
not an accepted released SafeJS installation. The full goal remains active.

## Color and cascade contract

- `parseCssColor` returns an immutable RGBA8 tuple, the `currentcolor` token, or
  `undefined` for unsupported/invalid input. `cssNamedColors` exposes 148 frozen
  named sRGB colors, including aliases. `transparent` is transparent black.
- Accepted values include 3/4/6/8-digit hex, legacy comma and modern space/slash
  `rgb`/`rgba` and `hsl`/`hsla`. Hue supports numbers, deg, grad, rad and turn.
  Finite exponent notation is accepted; components and alpha are clamped and
  quantized to eight bits. Legacy RGB rejects mixed number/percentage channels.
  Modern RGB accepts that mixture. The standalone parser uses ASCII CSS whitespace
  and caps input at 256 UTF-16 code units.
- The inline declaration bridge and stylesheet parser share normalization. Named
  colors/tokens remain lowercase names; hex/functions become `rgb(...)` or
  `rgba(...)`. Serialized alpha round-trips all 256 stored alpha values. This is
  the engine's RGBA8 normalization, not a claim of full CSSOM color serialization.
- The cascade accepts `color` and `background-color`, including the existing
  `initial`, `inherit`, `unset`, `revert`, `all`, importance and selector rules.
  Foreground inherits; background defaults to transparent and does not inherit
  implicitly. In this author-only paint cascade, revert returns the inherited
  foreground or transparent background; a complete UA color sheet remains absent.
- `documentStyles(tree).paint(id)` returns an immutable native `PaintStyle`:
  `color` is resolved RGBA8 and `background-color` is RGBA8 or `currentcolor`.
  Keeping the background token lets explicit inheritance resolve it against the
  new element's foreground. `paintBackground(style)` resolves that token.
  Revision/viewport invalidation and document closure follow existing ownership.
- The `styles` command exposes `paint`; capabilities include a partial `cssPaint`
  record. No guest `getComputedStyle` or client-geometry API is claimed by this work.

Not implemented: system colors, missing/relative components, wide-gamut spaces,
HWB/Lab/LCH, color mixing, calc/var, CSS-wide `revert-layer`, general background shorthand,
images/gradients, borders, opacity groups, blend modes, filters or decorations.
Unsupported stylesheet or direct-inline declarations continue to block native
layout/capture through diagnostics, even on hidden content. Recognizing a color
does not make other styling safe to ignore.

## Paint contract

`rasterizeDocument(tree, options)` retains its `normal-flow-text-raster` stage name
and `partial: true`. The stage now includes these solid paint operations:

1. Allocate a caller-owned opaque white RGBA surface. Paint the root background
   across the entire capture, including outside the root's local box. For an HTML
   root with transparent background, use the first direct body child's background.
   A display:none source contributes no canvas background. Do not paint a propagated
   root/body background again locally; alpha must not be compounded accidentally.
   Propagated `currentcolor` is treated as specified on the root and resolves there.
   Visibility does not suppress the propagated canvas; it does suppress local boxes
   and glyphs. `canvasBackground` records the source ref and resolved RGBA value.
2. Paint visible nonpositioned block backgrounds in formatting-tree order, covering
   content/padding, not margins. All these backgrounds precede in-flow text, including
   when negative margins make a later block overlap earlier text. Anonymous blocks
   and display:contents do not invent local background rectangles.
3. Within each line, the later `INLINE-BOXES.md` checkpoint uses actual inline
   layout fragments, including empty padded boxes and first/last horizontal edges.
   Paint backgrounds in formatting-tree order, using each inline's own font em box
   and padding. Then paint visible glyph ink using its resolved foreground. Fragments
   split at line boundaries; later-line backgrounds can overlap earlier-line ink.
   Hidden descendants retain geometry without forcing hidden backgrounds to paint.

This inline order relies on the supported LTR profile without transforms,
positioning or bidi. It is not a general stacking-context
implementation. Empty zero-width inline content has no background area. Fractional
coordinates use existing pixel-center sampling; alpha uses the existing straight
RGBA8 source-over implementation, not linear-light compositing or antialiasing.

Clips remain document-coordinate windows, not reflow requests. Layout and painting
do not change DOM revision. Previously returned pixels remain usable after source
closure, while new captures fail. Native `encodePng` emits a real RGBA PNG without
external encoders, now with bounded compression (`PNG-COMPRESSION.md`). `CAPTURE-EXPORT.md`
adds restricted viewport/block CLI and playground PNG export; general element
bounds, high-density rendering and PDF remain open.

## Work and memory

Existing formatting, text, document-coordinate and framebuffer limits still apply.
The paint limit remains 32 million work units, lowerable by callers. It charges
surface initialization, canvas/box/fragment scans, inline ancestry walks, clipped
background pixel/row work, and glyph work. Offscreen colored fragments are counted
but their fills are culled. No persistent document-to-raster cache is introduced.

`check:paint-resources <small|medium|large>` uses in-memory HTML, a shared stylesheet,
colored paragraphs and inline spans, a 640 × 480 capture and PNG encoding. One fresh
Node process per profile produced the following September 2, 2026 measurements:

| Paragraphs | Parse ms | Cascade/layout/paint ms | PNG ms | Peak process RSS MiB |
| --- | --- | --- | --- | --- |
| 100 | 5.8 | 66.2 | 7.2 | 71.2 |
| 1,000 | 27.3 | 160.8 | 7.5 | 118.0 |
| 5,000 | 80.2 | 448.1 | 7.3 | 202.0 |

The largest run retains 158,890 positioned glyphs, 5,003 boxes and 5,000 colored
inline fragments. Only 53 background fills and 617 nonblank glyphs intersect the
viewport; paint work is 1,248,844 units. Each PNG is 1,229,438 bytes with matching
digest because the visible prefixes match. These are individual measurements, not
performance thresholds or evidence that this workload fits a small Worker heap.
Results are retained across close; forced GC is not used. The stylesheet-based
workload differs from the prior document-layout profile, so timings are not a
controlled before/after comparison.

## Verification

- `reports/css-paint-focused-2026-09-02.json`: 1,886 passing tests in 80 files,
  including 86 new parser/cascade/pixel cases. Named-color immutability, all alpha
  byte round-trips, inheritance, currentcolor, alpha/paint order, canvas propagation,
  wrapped fragments, clipping, mutation, closure and work limits are exercised.
- `reports/css-paint-safejs-fixture-2026-09-02.json`: twelve actual experimental-core
  checks. An interpreted click updates color/backgroundColor; the native inspection
  and real raster agree. Resize/crop, invalid style writes, unsupported layout,
  budget recovery and closure are checked with an in-memory transport.
- `reports/css-paint-native-render-2026-09-02.png`: visually inspected 640 × 600
  actual HTML document output, 1,536,783 bytes, SHA-256
  `eef8651847c1b4ff00a3cfcffed590089ac163f709261cbaef361c39057c04d6`.
  The dark canvas, colored blocks and wrapped inline highlights are engine-positioned,
  not manually placed demonstration panels.
- `reports/css-paint-{document,text}-regression-2026-09-02.json`: 23 further actual
  experimental-core checks. Their temporary PNGs are historical-stage regressions,
  not new public-site acceptance.
- `reports/css-paint-native-{small,medium,large}-2026-09-02.json`: 24 resource assertions.
  Build, strict changed-test checks and focused formatter/lint checks also pass.

The spec-driven tests are not cross-browser pixel comparisons. No new live website,
live terminal or released-SDK acceptance is claimed. Historical public HTML reads do
not establish script/render compatibility. Full CSS/layout/font support, client and
coordinate APIs, bot-block resistance and the reference feature ledger remain open.

Primary references consulted: CSS Color 4 (named colors and currentcolor), CSS
Backgrounds 3 (root/body propagation), and CSS 2.2 Appendix E (normal-flow paint
order), at `https://www.w3.org/TR/css-color-4/`,
`https://www.w3.org/TR/css-backgrounds-3/`, and
`https://www.w3.org/TR/CSS22/zindex.html`.
