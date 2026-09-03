# Built-in bitmap font and PNG primitives

Status: tested native building blocks, not document rendering. No new dependency,
browser engine, canvas package or runtime switch is involved.

Later checkpoint: `TEXT-LAYOUT.md` connects these metrics to the typography
cascade and source-mapped lines. It paints actual line glyphs in manually placed
demonstration panels, not a page screenshot or complete document layout.

`DOCUMENT-LAYOUT.md` subsequently adds actual normal-flow document positioning
and bounded text painting. Its new artifact uses engine-derived document positions,
not manual panels; it still does not establish full CSS or CLI screenshot support.

## Implemented surface

- `bitmapGlyph(character)` returns an immutable, shared glyph with a five-column,
  eight-row mask and exact ink bounds. The original built-in Agent Mono patterns
  cover all 95 printable ASCII characters. Space and nonbreaking space are blank.
  Other code points, including controls and lone surrogates, share a visible
  replacement glyph with `supported: false`; multiple code points are rejected.
- `bitmapFontMetrics(fontSize)` gives the same scale used by the painter. At
  eight pixels, the advance is six pixels, ascent seven, descent one and default
  line height ten. These are this font's metrics, not measurements of an installed
  system font. Positive finite sizes up to 512 pixels are accepted.
- `createRaster(width, height, background?)` owns a mutable RGBA8 pixel buffer in
  a frozen descriptor. Dimensions must be positive integers, at most 4,096 each,
  and at most 4,194,304 pixels overall. Invalid geometry, colors and buffer shapes
  are rejected before painting; sparse color arrays are invalid.
- `paintRasterRect` clips a half-open rectangle to the buffer using pixel-center
  sampling. `paintBitmapGlyph` applies exactly the same sampling to scaled mask
  cells and returns whether the requested glyph is supported. Fractional sizes
  are nearest-cell samples, not antialiasing. Coordinates use the existing bounded
  layout-number validation.
- Source-over compositing uses straight alpha and rounded eight-bit stored color
  channels. It does not perform linear-light conversion or color management.
- `encodePng(image)` returns a deterministic PNG byte array: RGBA8, noninterlaced,
  filter zero, IHDR/IDAT/IEND only. CRC32, Adler32 and the zlib writer
  are implemented locally. The engine does not import Node's zlib; tests use its
  independent inflater as an oracle. Encoding does not mutate the source pixels.

## Resource and compatibility limits

The original checkpoint used **uncompressed DEFLATE blocks**. The later
`PNG-COMPRESSION.md` encoder defaults to bounded compression with stored fallback;
explicit `{ compression: "stored" }` preserves this original representation.
Stored file size is approximately the four-byte-per-pixel source plus row/block and
chunk overhead. Encoding temporarily holds several image-sized allocations. A
maximum-sized image has a 16 MiB source buffer; transient total image/encoder
buffers can exceed 64 MiB before garbage collection. This is not a measured
maximum-process-RSS guarantee or a claim of Cloudflare deployment readiness.

There is no font loading, shaping, kerning, bidi, emoji or general Unicode font
coverage. Missing glyphs are explicit, not substituted with invented measurements
of another font. This API handles individual glyphs, not text runs, wrapping or
CSS whitespace by itself. The separate text-layout stage now connects metrics to
the style/formatting pipeline. Raster rectangles are not layout/client rectangles.

There is **no document paint pipeline or working page `screenshot`/`pdf` command**
from this change. Full vertical/inline layout, fuller CSS typography/colors/backgrounds,
clipping/stacking, images and page captures remain separate acceptance gates.
No real website or released SafeJS SDK was newly accepted by this native probe.

## Reproducible evidence

From the repository root after building the package:

```sh
node packages/browser-agent/dist/scripts/check-bitmap-renderer.js /tmp/agent-mono.png
```

The command writes exactly the requested image path and reports native-only
metrics. The package alias is `check:bitmap-renderer`. It does not open a socket,
start a service, fetch a site or run page JavaScript.

`reports/bitmap-renderer-atlas-2026-09-02.png` is an actual output from this font,
rasterizer and encoder, visually inspected for ASCII readability, descenders,
spacing, fractional-size sampling and explicit fallback boxes. It contains all
95 printable ASCII glyphs, sample text and three unsupported glyphs; it is not a
website screenshot. `reports/bitmap-renderer-native-2026-09-02.json` records its
720 × 384 dimensions, 1,106,452 bytes and SHA-256 digest. Its single-run timing/RSS
are observations, not controlled comparative performance evidence.

The regression report records 1,667 passing tests across 73 files, including
58 new cases. The three focused test files cover every printable ASCII mask and ink bound,
immutable/shared glyphs, metrics, unsupported code points, invalid inputs,
all ASCII glyphs at three integer scales, fractional/clipped sampling, spacing,
alpha compositing and PNG integrity. Independent bitwise CRC checks and Node
inflation recover exact rows/pixels. Fixtures include an exactly 65,535-byte raw
payload and multi-block payloads to exercise stored-block boundaries and trailers.
