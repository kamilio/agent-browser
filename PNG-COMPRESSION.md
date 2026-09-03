# Bounded, dependency-free PNG compression

Native PNG exports now compress their scanlines by default. The encoder, artifact
transport, CLI writer and playground still use the same lossless RGBA8 PNG format.
This change reduces the measured byte-transfer and memory costs; it does not expand
the supported CSS, page JavaScript, image/font or PDF feature set.

## Contract

```ts
const compressed = encodePng(image);
const legacyStored = encodePng(image, { compression: "stored" });
const bounded = encodePng(image, { maxWork: 4_000_000 });
```

- `compression` accepts `auto` (the default) or `stored`. Auto tries one fixed-Huffman
  DEFLATE block with LZ77 matches. If its entire zlib stream would not be smaller
  than stored blocks, it emits stored blocks instead. It never publishes a partial
  stream or grows the result beyond the stored representation.
- Matches use a 65,536-entry three-byte hash table, the single most recent candidate,
  a maximum distance of 32,768 bytes and maximum length of 258. Overlapping matches
  are supported. There are no unbounded candidate chains or recursive searches.
  Keeping only one candidate trades compression ratio for bounded work and memory.
- Fixed literal/length and distance codes, bit packing, zlib framing, Adler32 and
  the stored fallback are implemented in TypeScript. The runtime does not import
  Node zlib, native compression bindings, external libraries or browser services.
- The DEFLATE input is capped at 16,781,312 bytes, enough for the existing maximum
  RGBA raster plus one filter byte per row. Hash insertions, candidate-byte comparisons,
  symbol emission, checksumming and stored copying are charged against a maximum
  128-million-unit budget. `maxWork` can lower that ceiling; exhaustion throws a
  resource-limit error rather than ignoring the limit or returning corrupt output.
- Candidate output grows geometrically under the strict stored-size ceiling; the
  hash table occupies 256 KiB. Output buffers remain caller-owned. A stored fallback
  may temporarily coexist with the abandoned candidate buffer before GC.
- PNG still uses filter zero, RGBA8, no interlacing and IHDR/IDAT/IEND chunks.
  Pixels, including RGB under zero alpha, are preserved exactly. The codec budget
  is not a total PNG/raster/CRC wall-clock budget. Encoding still has whole-image
  scanline buffers; this is not a constant-memory streaming encoder.

The encoder does not implement dynamic Huffman trees, lazy/multi-candidate match
searches, adaptive PNG filters, palette conversion or streaming compression.
`PNG-DECODING.md` now provides a separate bounded runtime inflater and PNG decoder;
this does not change the encoder's fixed-or-stored strategy, which removes the measured
large flat-color/text payload overhead without adding a dependency.

## Actual artifact comparison

The existing interpreted click/capture fixture was rerun through the ordinary
`screenshot` artifact path and CLI writer. The original stored PNG is preserved.
Node's independent inflater verifies that both files produce **byte-identical
filtered RGBA scanlines**, not just the same dimensions or a similar-looking image.

| Native document | Before | Compressed |
| --- | --- | --- |
| 1,024 × 768 PNG | 3,146,804 bytes | 52,889 bytes |
| Reduction | — | 98.319% (59.50× smaller) |

`reports/png-compression-pixel-comparison-2026-09-02.json` records the comparison.
The compressed artifact is `reports/png-compression-native-render-2026-09-02.png`,
SHA-256 `64de16beea7e2ef16ddea64a010cf42ddd361892a889526bf69b87533032b88e`.
Its decoded pixels are exactly those of the previously visually inspected native
capture, whose baseline SHA-256 is
`c90236a2d8db076a60620e1d5dd0671683bf30cdcd8e1b693a94c98801f2bb1e`.

This is an actual engine-generated document, not a synthetic compression-only
image or a new live-site/browser screenshot claim.

## Capture resource profiles

The same 100-paragraph native capture workload from `CAPTURE-EXPORT.md` was run in
fresh Node processes. Timings cover render, encode, owned artifact storage, JSON
frame round trips, decoding and release in one process. They exclude wire latency.

| Viewport | PNG bytes, old → new | Frames, old → new | ms, old → new | Peak RSS MiB, old → new |
| --- | --- | --- | --- | --- |
| 640 × 480 | 1,229,438 → 43,785 | 21 → 3 | 166.0 → 94.3 | 104.3 → 70.8 |
| 1,280 × 720 | 3,687,468 → 78,482 | 59 → 4 | 419.4 → 205.3 | 113.1 → 74.7 |
| 2,048 × 1,024 | 8,390,340 → 133,496 | 131 → 5 | 955.8 → 418.7 | 129.5 → 96.0 |

These are individual before/after observations on the recorded machine, not repeated
statistical trials, universal speedups or Worker heap-fit guarantees. Client output
remains retained after close; forced GC is not used. High-entropy input can fall back
to stored blocks and pay the extra bounded attempt cost. The existing eight-artifact,
32-MiB retention cap and two-MiB frame limits are unchanged.

## Verification

- `reports/png-compression-focused-2026-09-02.json`: 2,010 passing tests in 87 files,
  89 more cases than the capture-export checkpoint. Codec tests cover known empty
  streams, literal ranges, match/window/code boundaries through distance 32,768,
  run lengths through 258, incompressible fallback, deterministic output, subarray
  offsets, source immutability, malformed options and budget exhaustion. A maximum-
  sized scanline input and 100 seeded mixed/random/repeating fixtures use native
  inflate as an independent oracle.
- PNG tests independently verify chunk CRCs and decoded scanlines in compressed
  and explicit stored modes. A deliberately stored PNG larger than the protocol
  frame limit still exercises multi-frame artifact transfer, so smaller production
  output has not weakened the large-payload test.
- `reports/png-compression-safejs-fixture-2026-09-02.json`: nine actual experimental-
  core export checks, including interpreted pixel changes, block crops, resizing,
  local file writing and cleanup. The default runtime/released-SDK gate is unchanged.
- `reports/png-compression-pixel-comparison-2026-09-02.json`: independent decode
  equality and byte-reduction assertions on the actual old/new document captures.
- `reports/png-compression-native-{small,medium,large}-2026-09-02.json`: eighteen
  resource assertions. Historical stored-output reports are not overwritten.
- `reports/png-compression-{final,paint}-regression-2026-09-02.json` repeats the
  export checks and twelve existing actual-core paint checks with the final encoder.
  `reports/png-compression-paint-resources-2026-09-02.json` verifies the existing
  small paint workload and retained-buffer assertions with compressed PNGs.

Build, strict changed-test checks and focused formatting/lint pass. No new live
website, socket, terminal or playground acceptance is claimed. The full browser
goal remains active, with the existing compatibility ledger and unresolved gates.

Format references: RFC 1950 zlib framing and RFC 1951 DEFLATE fixed codes and
length/distance rules. The implemented subset is described above rather than
presented as a general compression toolkit.
