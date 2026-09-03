# Native PNG image decoding

September 3, 2026: the package now exports a dependency-free PNG decoder and
bounded zlib inflater. This codec alone is not browser image acceptance.
`IMAGE-RESOURCES.md` subsequently connects it to page-owned loading and guest image
state; `IMAGE-LAYOUT.md` adds loaded PNG normal-flow layout and painting. The existing
PNG encoder and screenshots remain byte-compatible; only their checksum helpers
are shared with the new decoder.

## API and implemented profile

```ts
const decoded = decodePng(bytes, { maxWork: 30_000_000 });
const { width, height, pixels } = decoded.image;
const filtered = inflateZlib(zlibBytes, expectedOutputBytes);
```

The image resource owner can additionally pass a lower `maxPixels` ceiling.
IHDR rejects an oversized image before inflating its scanlines or allocating RGBA.

- `decodePng` returns caller-owned, non-premultiplied RGBA8 pixels plus source bit
  depth/color type, interlace flag, compressed/inflated sizes, work count and names
  of skipped ancillary chunks. The result, image descriptor and metadata list are
  frozen; the pixel buffer is intentionally mutable and does not alias input.
- All fifteen legal static PNG color/depth combinations are handled: grayscale
  1/2/4/8/16, RGB 8/16, indexed 1/2/4/8, grayscale-alpha 8/16 and RGBA 8/16.
  Palette entries and optional `tRNS` transparency are validated. Color-key matches
  use original sample precision before conversion; 16-bit channels are scaled to
  bytes with nearest-integer rounding. Transparent RGB samples are preserved.
- None/Sub/Up/Average/Paeth filters and all seven Adam7 passes are decoded. Empty
  passes contribute no scanlines; packed samples restart at each row and pass.
- Chunk signatures, names, CRCs, header methods/dimensions, required ordering,
  consecutive IDAT segments, palette indices, transparency values and the terminal
  IEND are checked. Unknown critical chunks reject. No partial image is returned
  on invalid input, decompression failure or quota exhaustion.
- `inflateZlib` handles stored, fixed-Huffman and dynamic-Huffman blocks, overlap
  copies and cross-block history. It validates canonical trees, repeats, reserved
  symbols, end markers, advertised history windows, exact output length and Adler32.
  An exact expected output length is required before allocation. Preset dictionaries
  are explicitly unsupported; raw DEFLATE and gzip are not accepted wrappers.
- The runtime is TypeScript with typed arrays and no Node zlib, browser image APIs,
  canvas service or added dependency. Node zlib and already-installed Pillow are
  independent **test-only** producers/readers, never production decoder fallbacks.

## Resource and compatibility boundaries

Input is capped at 32 MiB and 4,096 PNG chunks. Raster dimensions remain at most
4,096 per axis and 4,194,304 pixels. The inflater output ceiling is 33,600,000 bytes,
enough for bounded 16-bit RGBA pass scanlines. It permits at most 65,536 DEFLATE
blocks. Both entry points enforce at most 268,435,456 abstract work units and allow
callers to lower the ceiling; PNG charges framing/copy/filter/pixel work and passes
its remaining budget to the inflater. Counters are not wall-clock guarantees.

This is a whole-image decoder, not a streaming or constant-memory implementation.
Input, joined IDAT bytes (when fragmented), inflated scanlines and RGBA output can
coexist. Two per-pass row buffers are reused; no pixel cache or input-dependent
Huffman table is retained between calls. Small fixed-code tables are shared.
Near maximum dimensions, total process memory is larger than one RGBA
buffer; a one-megapixel sample must not be treated as a worst-case memory bound.

Ancillary chunk payloads, including ICC/gamma/HDR profiles, EXIF, text and APNG
animation controls, are not interpreted or inflated. Their names are reported in
`ignoredAncillaryChunks`; their CRCs still validate. Pixels are unmanaged source
channel values, not color-managed output. An APNG yields only its default PNG image,
not animation frames; ignored animation metadata is not validated as an APNG stream.
Trailing bytes, nonconsecutive IDAT and malformed ancillary framing reject under
this strict decoder profile. Full PNG/APNG conformance is not claimed.

## Validation

- `reports/png-decoder-focused-final-2026-09-03.json`: all 2,613 tests pass across
  106 explicit safe files, including 179 PNG decoder and 29 inflater cases. The
  initial report is retained separately. Build, strict changed-test checking,
  ten-file lint, eleven-file formatting and package whitespace checks pass.
- `src/png-decoder.test.ts` exercises the full color/depth/filter/interlace matrix,
  narrow images with empty passes, color keys before precision reduction, native
  screenshot round trips, fragmented streams and invalid or over-budget inputs.
- `src/inflate.test.ts` uses independent Node zlib streams, literal-only dynamic
  trees, multiblock/stored/fixed/dynamic encodings, overlap/history rules, malformed
  trees and headers, every truncated prefix, quotas and 1,000 deterministic bit
  mutations checked against the independent inflater when accepted.
- `reports/png-decoder-independent-2026-09-03.json`: fifteen assertions pass using
  installed Pillow 11.1.0. It independently decodes all 110 generated <=8-bit
  color/filter/interlace fixtures with exact pixel hashes. Our decoder also reads
  six independently Pillow-encoded image modes and preserves pixels on re-encoding.
  The 16-bit matrix has native expected-sample assertions, not a Pillow RGBA oracle.
- `reports/png-decoder-independent-final-2026-09-03.json` repeats all fifteen
  assertions successfully after final validation changes. The one-megapixel decode
  takes 40.896 ms; maximum process RSS is 84,504 KiB under the same scope below.
- `reports/png-decoder-background-regression-2026-09-03.json`: thirteen existing
  actual experimental-SafeJS background/capture assertions pass. Shared checksum
  extraction preserves responsive PNG/PDF byte restoration; this does not exercise
  image loading or establish released-SDK acceptance.
- The same local probe decodes a 1,024 x 1,024 fixture (43,969 encoded bytes) in
  40.907 ms with 21,332,581 charged units. Maximum Node process RSS across the whole
  probe is 83,928 KiB. This is one uncontrolled sample including earlier fixture
  activity in RSS, not a Worker, page-runtime or browser-wide performance result.

Run `npm run check:png-decoder --workspace=@automations/browser-agent` after a
package build. The independent probe requires the existing Python/Pillow tools;
it fails visibly if unavailable and never installs or downloads them. Temporary
fixture files are isolated and removed by that probe; the JSON report retains the
checks rather than image content. No network or live browser is used.

## Remaining image integration tasks

- [x] Bounded independent PNG and zlib decoding with actual pixel validation.
- [x] Bounded PNG page-owned resource records, origin/policy-checked fetches, deduplication,
  cancellation and aggregate encoded/decoded byte quotas with close-time release.
- [x] Bounded HTML image source changes, natural dimensions, completion/decode state and
  owned load/error delivery through the real page runtime.
- [ ] Replaced-element inline/block sizing and native image compositing into shared
  document PNG/PDF captures; not a separate image-only capture path.
- [ ] Agent/playground inspection and real-site fixtures proving displayed image
  content, failed-resource reporting, source replacement and teardown.
- [ ] Other image formats, color management, animated images, fonts, SVG and canvas.

Specifications consulted: PNG Third Edition (June 24, 2025),
https://www.w3.org/TR/png-3/ ; RFC 1950 and RFC 1951,
https://datatracker.ietf.org/doc/html/rfc1950 and
https://datatracker.ietf.org/doc/html/rfc1951 . No reference implementation source
was copied into the decoder.
