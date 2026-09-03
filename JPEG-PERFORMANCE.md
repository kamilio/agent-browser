# JPEG reconstruction and page-budget performance

September 3, 2026: the one-megapixel progressive JPEG that previously exceeded
the default page decode-work limit now loads through the actual page owner and
experimental-SafeJS agent path. The limit remains **33,554,432 work units**. No
dependency, output downsampling shortcut or alternate image backend is introduced.

## Real algorithm changes

`jpeg-idct.ts` replaces repeated cosine sums with a scaled separable inverse
transform. Quantization incorporates the fixed frequency scaling once per component,
only if a nonconstant block needs it. Each one-dimensional transform uses five
rotation multiplications and sum/difference stages. The existing DC-only block
path is retained. A reusable 64-value scratch vector feeds the existing sample plane.

`jpeg-sampling.ts` avoids applying a bilinear filter to full-resolution components:
it returns views into their actual sample rows. For subsampled components, horizontal
indices and weights are prepared once; two Float64 row caches reuse horizontal
interpolation across neighboring output rows. Vertical mixing retains the original
arithmetic order and rounding. This is the same centered bilinear reconstruction,
not nearest-neighbor chroma or lower-resolution decoding.

The working-buffer preflight includes these caches and mappings. A resampled
component needs 33 bytes per output column, or 17 without horizontal mappings.
Full-resolution components need no pixel scratch buffer. The measured photo adds
67,584 bytes (66 KiB) of accounted scratch; the 64 MiB decoder working-buffer ceiling
and the page's shared 16 MiB retained RGBA ceiling are unchanged.

## Work accounting

Work counters are conservative algorithm-level units, **not CPU instructions** or
milliseconds. Header, entropy, scan/block and output accounting retain their existing
guards. Kernels charge before executing their bounded work:

- Dense inverse blocks now charge 208 units: 64 dequantization products, 16 × 5
  rotation products, and 64 output visits, rather than the previous 1,088-unit direct
  transform path. The separate existing 64-unit AC/constant-block inspection remains.
- Quantization scaling charges 128 units when first needed by a component.
- Direct sample rows charge one read per output sample. Horizontal expansions charge
  their one/two source taps; vertical mixing charges one/two taps per output sample.
  Mapping preparation and per-row coordinate work are also charged. Reusing an
  already computed row does not pretend to recompute its taps.
- The four-units-per-pixel final serialization charge remains. Working-memory
  preflight now includes the actual additional row storage rather than hiding it.

Thus the reduced counter accompanies less executed arithmetic and a measured
wall-clock improvement. The work limit was not raised or disabled, and no response
bytes, scans or output pixels are skipped to satisfy it.

## Before/after evidence

A fresh pre-change five-run baseline records a 155.700 ms median for the same
278,459-byte, 1,024×1,024 progressive JPEG. The first paired optimized run records
76.226 ms (about 2.04× faster). Work falls from 69,854,692 to **30,444,593**;
accounted working buffers change from 7,880,704 to 7,948,288 bytes.

All 252 independent-fixture outputs and the one-megapixel output are byte-identical
to saved pre-change pixels. Their existing independent Pillow comparisons also
pass without relaxing the one/two/three-channel-value tolerance. The photo retains
SHA-256 `97eba99798a981a361e55aef5f02689e70c4895a356f28abf1e04603ddd0eb39`.
This establishes identity on the tested data, not every possible floating-point JPEG.

The runtime probe's optional large-photo path now has 30 passing assertions. Real
guest code sets the JPEG source and awaits `decode()`, sees 1,024×1,024 intrinsic
dimensions and the correctly scaled geometry, and exports an actual 132×132 element
PNG. Every 128×128 content pixel is checked against the decoded source's expected
sampling position. PDF visual pixels are compared with the mixed JPEG/PNG document
raster. The photo passes the unchanged page guard through `DocumentImages`, not
merely a standalone decoder with a larger limit. The screenshot is 3,876 bytes;
the largest observed protocol frame is 8,543 bytes.

Mathematical tests compare every DCT basis frequency at multiple signs/magnitudes,
plus 256 dense/sparse blocks with 16-bit quantizers, against the direct cosine
definition. Raw transform error is bounded relative to coefficient magnitude;
rounded samples stay within one value. Sampling tests preserve direct-formula
rounding across odd sizes, edges, rational factors, padded strides and reordered
cache access. Additional tests cover charged cache reuse and memory preflight.

## Final validation — September 3, 2026

- All **2,924 tests pass across 116 explicitly selected safe files**, including
  92 transform/sampling cases and the additional decoder memory-preflight case.
- Final and repeat paired runs preserve every pixel across 252 fixtures and the
  photo. Five-run medians are **81.356 ms** and **78.170 ms**, respectively, versus
  the saved 155.700 ms baseline (approximately 1.91× and 1.99× faster locally).
  Both retain 30,444,593 work units and 7,948,288 accounted working bytes.
- Both independent 252-fixture comparisons pass with unchanged tolerances;
  both actual experimental-runtime large-photo probes pass all 30 checks with
  identical resource and screenshot hashes. The default small-image regression
  passes 26 checks, and the separate media-command regression passes 11.
- Package build, strict checking of the three transform/sampling/decoder test
  files, eight-file lint, nine-file formatting and whitespace checks pass.

Machine-readable evidence is indexed in `reports/README.md`. These mocked-transport
runtime checks do not establish real-site, Worker or released-SDK compatibility.

## Scope and reproduction

Five-run medians are local measurements, not universal speed or Worker guarantees.
The comparison process also holds reference data; its peak RSS is not the decoder's
standalone footprint. Bigger or more complex JPEGs can still exhaust the work or
memory guards. This checkpoint does not enable CMYK, color management, orientation,
other image formats, general CSS rendering, released-SDK or live-site acceptance.
The separate experimental runtime's media function-identity failure remains open.

```sh
python3 packages/browser-agent/scripts/jpeg-reference.py /tmp/agent-browser-jpeg-reference
node node_modules/typescript/bin/tsc -p packages/browser-agent/tsconfig.json --outDir packages/browser-agent/dist
node packages/browser-agent/dist/scripts/check-jpeg-decoder.js /tmp/agent-browser-jpeg-reference
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/tmp/agent-browser-safejs-13.0.10/packages/safe-js node packages/browser-agent/dist/scripts/check-image-resources.js /tmp/agent-browser-jpeg-reference/benchmark.jpg
```

The paired `check-jpeg-performance.js` additionally takes a saved pre-change report
and pre-change pixel directory. The archived run uses
`reports/jpeg-performance-before-2026-09-03.json` and
`/tmp/agent-browser-jpeg-before-2026-09-03`. Those before pixels were captured before
the optimization; they are not regenerated from the implementation under test.
Normal unit tests use retained fixtures and do not require Python or those artifacts.

Design references: the scaling/quantization strategy described in Arai, Agui and
Nakajima's *A Fast DCT-SQ Scheme for Images* (publisher abstract at
`https://globals.ieice.org/en_transactions/transactions/10.1587/e71-e_11_1095/_p`),
and the direct JPEG inverse-transform definition in ITU-T T.81
(`https://www.w3.org/Graphics/JPEG/itu-t81.pdf`). The TypeScript implementation and
its direct-formula oracle are local code, not an imported codec implementation.
