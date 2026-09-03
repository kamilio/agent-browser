# Native JPEG resources and rendering

The subsequent `JPEG-PERFORMANCE.md` checkpoint replaces repeated transform/filter
work with bounded fast kernels. The measured one-megapixel image now loads under
the unchanged page guard with identical pixels. The original codec-introduction
measurements below remain historical evidence, not its current performance result.

September 3, 2026: the TypeScript browser decodes baseline, extended-sequential and
progressive **8-bit Huffman JPEGs** itself. JPEG resources use the existing document
loader, session policy, image lifecycle, geometry and shared PNG/PDF renderer.
No runtime dependency, host image decoder or remote browser is added.

## Implemented profile

- Grayscale, RGB and YCbCr images, with JFIF/Adobe color-space markers and the
  conventional untagged RGB component-ID distinction. Four-component CMYK/YCCK
  and ambiguous conflicting color-space markers are explicitly unsupported.
- Baseline/extended sequential scans, including component-separated scans, and
  progressive DC/AC spectral selection plus successive approximation. Negative
  DC refinement and signed AC magnitude refinement are tested separately.
- Canonical Huffman tables, 8-/16-bit quantization tables where the frame permits
  them, differential DC prediction, zigzag AC runs, progressive EOB runs, stuffed
  entropy bytes, one-bit padding and cyclic restart markers. Predictors reset at
  restart boundaries; EOB runs cannot cross a restart or scan boundary.
- Bounded coefficient planes followed by a separable floating-point inverse DCT.
  Constant blocks use a DC-only path. Samples are level-shifted, clipped and
  converted to opaque RGBA. Chroma upsampling uses centered bilinear sampling;
  scaling the resulting HTML image still uses the renderer's nearest-neighbor path.
- Sampling factors from one through four are parsed, subject to the ten-block MCU
  profile ceiling. Independent pixel evidence covers grayscale, stored RGB and
  YCbCr 4:4:4, 4:2:2 and 4:2:0, including odd dimensions and padded edge blocks.
- Duplicate/out-of-order progressive coefficient scans, missing tables, invalid
  spectral/approximation parameters, truncated streams, invalid Huffman trees and
  out-of-band runs fail explicitly. The standalone profile requires SOI/EOI and
  rejects trailing bytes; it is not a JPEG container/extracted-thumbnail parser.

`decodeJpeg(bytes, { maxWork, maxPixels, maxWorkingBytes })` is the native codec API.
`decodeImage(bytes, mediaType, { maxWork, maxPixels })` dispatches explicit PNG/JPEG
MIME types and returns a `mediaType`-discriminated decoded result. The document owner
uses that dispatcher; renderers consume the shared RGBA image rather than a codec-
specific object. Session `Accept` and agent capabilities share the supported MIME
list. `images` now reports `mediaType` and ignored metadata marker names; its legacy
`ignoredAncillaryChunks` field remains specific to PNG.

Only a single explicit `image/jpeg` or `image/png` response type is accepted after
normalization. Filename extensions do not select a decoder. No MIME sniffing or
`image/jpg` alias is claimed; a mismatched MIME/body produces a decode error.

## Resource bounds and limitations

| Standalone JPEG ceiling | Value |
| --- | --- |
| Encoded input | 32 MiB |
| Width or height | 4,096 pixels |
| Output pixels | 4,194,304 |
| Header/scan segments | 4,096 |
| Scans | 256 |
| Decode work | 268,435,456 units |
| Working-buffer budget | 64 MiB |

Caller limits only decrease those ceilings. Working-buffer preflight covers the
retained coefficient/sample planes plus a 16 KiB allowance for fixed decoder
tables/scratch. Input and output RGBA buffers are additional. This accounting is
not a garbage-collector or total-process memory bound. Metadata content is skipped,
not retained in the decoded result; only bounded marker names are reported.

Page resources retain the stricter limits in `IMAGE-RESOURCES.md`, including the
8 MiB response-body cap, shared 16 MiB retained RGBA budget and **33,554,432 work
units per decode**. A JPEG may fit the standalone codec but exceed the page budget.
At introduction, the measured 1,024×1,024 progressive benchmark required 69,854,692
work units and was rejected by the default page decode budget. `JPEG-PERFORMANCE.md`
subsequently reduces that to 30,444,593 and verifies the actual page load without
raising the guard. Larger or more complex photos can still exceed the budget.

Arithmetic coding, lossless/hierarchical JPEG, 12-bit precision, deferred dimensions,
CMYK/YCCK conversion, EXIF orientation, ICC/color management, metadata density
correction and embedded thumbnails are not implemented. APP1/APP2 metadata is
reported but not interpreted. Partial progressive data is not displayed while a
response streams; the owned resource becomes available after the complete decode.
Broken-image fallback, responsive sources and full browser image conformance remain
open. There is no new live-site or Worker deployment acceptance in this checkpoint.

## Evidence and reproduction

Final validation: `reports/jpeg-focused-final-2026-09-03.json` passes all 2,831
tests across 114 explicit safe files, including 86 new JPEG codec/resource cases.
Both `jpeg-decoder-independent-final-2026-09-03.json` and its repeat pass all 252
independent pixel fixtures. Both `jpeg-safejs-final-2026-09-03.json` and its repeat
pass all 26 actual-runtime checks; eleven existing responsive/capture assertions
pass in `jpeg-media-regression-2026-09-03.json`. Package build, strict checking of
four changed test files, thirteen-file lint, fourteen-file formatting, Python
reference syntax and package whitespace checks pass.

`scripts/jpeg-reference.py` uses the already-installed Pillow, only as an independent
test encoder/decoder. It produces 252 fixtures: several sizes, qualities, grayscale,
stored RGB, chroma sampling, baseline/progressive encoding, optimized tables,
restart intervals and long constant/EOB runs. Every source JPEG is independently
decoded to RGBA. Native output has maximum observed per-channel differences of
one for grayscale/stored RGB, two for YCbCr 4:4:4 and three for subsampled YCbCr.
These explicitly bounded differences include IDCT/upsampling rounding; they are
fixture evidence, not a claim of bit-identical libjpeg or full standard conformance.

Ten independent encoded/expected fixtures are retained in `scripts/jpeg-fixtures.ts`
for portable unit tests. Those tests additionally exercise analytic DC/AC samples,
separated/interleaved scans, malformed structures, all truncated prefixes of one
progressive fixture, quota failures and 1,000 isolated deterministic bit mutations.
The first unit runs exposed three incorrect restart-count expectations for images
too small to contain a restart marker, and a test using `appendChild` instead of the
native tree's `append`. These fixture mistakes were corrected, not hidden by decoder
fallbacks or weakened pixel tolerances.

The actual experimental-SafeJS loader/agent probe now has 26 passing checks. Page
code loads PNG, baseline JPEG and progressive JPEG, awaits decode, handles events
and observes live geometry. Both JPEG element captures are 21×17 PNGs with identical
1,099-byte exports and the same hash. The PDF assertion compares its actual visual
stream to the mixed PNG/JPEG document raster. The largest protocol frame is 3,691
bytes. This uses production session/loader/agent code over mocked in-memory
responses, not an installed released SDK, socket, live website or external renderer.

```sh
python3 packages/browser-agent/scripts/jpeg-reference.py /tmp/agent-browser-jpeg-reference
node node_modules/typescript/bin/tsc -p packages/browser-agent/tsconfig.json --outDir packages/browser-agent/dist
node packages/browser-agent/dist/scripts/check-jpeg-decoder.js /tmp/agent-browser-jpeg-reference
```

The independent report includes actual tool versions, fixture comparisons, work,
buffer accounting, pixel hashes and a single local one-megapixel timing/RSS sample.
It is not a throughput, browser, Worker or total-memory benchmark.

The codec-introduction local sample decodes the 278,459-byte one-megapixel JPEG in 154.267 ms,
with 7,880,704 accounted working-buffer bytes and 83,284 KiB process peak RSS. The
repeat takes 165.064 ms with the same work count and pixel hash. Both explicitly
record `fitsDefaultPageDecodeBudget: false`. The later performance checkpoint
supersedes this measured case with successful actual page/agent evidence.

Primary design references: ITU-T T.81 (`https://www.w3.org/Graphics/JPEG/itu-t81.pdf`),
JFIF (`https://www.w3.org/Graphics/JPEG/jfif3.pdf`) and Pillow's test-encoder options
(`https://pillow.readthedocs.io/en/stable/handbook/image-file-formats.html#jpeg`).
