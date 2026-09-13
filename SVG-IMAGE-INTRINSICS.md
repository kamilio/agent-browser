# Fractional native SVG image dimensions

Native SVG image decoding keeps intrinsic CSS dimensions separate from raster
storage. Positive absolute fractional root dimensions are not rounded to make
the image fit an integer-size decoder interface.

`DecodedSvgImage.intrinsic` preserves the computed width and height, including
fractional px values and absolute-unit conversions. The pixel buffer uses
`ceil(width)` by `ceil(height)` samples. The SVG scene is projected at the actual
fractional dimensions and mapped into that integer sample grid; changing the
sample count does not change the intrinsic aspect ratio used in document layout.

`imageIntrinsicSize` gives image consumers the proper intrinsic dimensions.
Replaced-element layout uses the full values, including CSS sizing and min/max
constraints. Image-owner `naturalWidth` and `naturalHeight` expose nonnegative
integer dimensions separately; a successfully decoded subpixel image is not
treated as broken merely because those exposed integers are zero.

The decoder checks the rounded pixel allocation against the caller's pixel
budget before rasterization. Existing dimension, pixel, resource-memory and work
limits remain unchanged. Unrepresentable sampling scales fail explicitly. Native
PNG, JPEG and GIF intrinsic sizes continue to match their integer rasters.

This remains an absolute-root-dimension SVG subset. Missing, automatic or
percentage root intrinsic dimensions, context-dependent image sizing, complete
density correction, clipping paths, and full SVG conformance are separate gates.
Integer raster sampling does not establish antialiasing or rendering equivalence
to a different browser engine.

## Validation

The clean selected native gate passes **16,741 tests, zero failures, two unchanged
exclusions**, including **30 new fractional-intrinsic cases**. The initial
existing-regression run passes 955 cases in 17 suites; the final focused run
passes 985 cases in 18 suites. All strict, format and native checks pass, and the
broader gate additionally builds the runtime. No failed native test attempt was
discarded or reclassified.

The gate selects 322 suites and 321 strict roots from 700 explicit manifest
entries; 378 entries are not run. The separate total-host-object pressure and
unsupported-display/advisory-media exclusions remain unchanged. UTC receipts run
from **2026-09-13T00:24:50.834Z** to **2026-09-13T00:28:47.047Z** in
`node_modules/.cache/native-validation/native-svg-intrinsic-september13-round00/`.
Its audit verifies 1,213 unchanged tracked inputs, six owned source/test files
plus the manifest, 1,220 source files and 2,040 compiled artifacts. The post-commit
verification compares actual committed runtime blobs with the tested snapshot.
Unrelated dirty work is preserved; no push.

| Evidence | SHA256 |
| --- | --- |
| Source inventory | `6640e6fa42e30b752f1150dab496d0cb8ac3b5072775a42fd28cae51518f52bf` |
| Compiled inventory | `fb053fe674b604b82f4163b4f3779c02ca8687eaf23eb8b5ce628735b99d0b54` |
| Native results | `b5c23b36025133a90468d08875253a48ab5dc29eb8dd426c4034b805e09c65b4` |
| Gate summary | `c3bdc22fa7ae1175ebbf1f8dbea907be79f7aef5f50b32e7f43e2717657e9967` |
| Retained-body result | `63564c701a309d5c4da13b210be973ba562ab11c37109bea8271498450664025` |

Three independent retained-body decodes make zero HTTP requests and zero
navigations. IANA remains 234×72, 40 shapes, work 1,879,490; Python remains 16×16,
two shapes, work 121,567. Both intrinsic dimensions and exact pixels match their
prior retained results. SQLite now clears the intrinsic-dimension check and
fails during scene construction with `SVG scene: unsupported clip-path`. This
is progress through the genuine input, not a complete image or website pass.
The records are in `svg-intrinsic-clip-work-september13/captured-round00/` under
the same validation cache. Work/pixel limits are unchanged; the isolated child
exits normally and private HOME/TMP are empty.

## Source Evidence

Using only the pinned native browser, a separate standards review makes three
initial GETs with three HTTP 200 responses. SVG2 coordinates and HTML embedded
content yield two native parses and 42 semantic containers. The evidence
establishes length-derived intrinsic dimensions, absolute-width/height ratio
precedence, the viewport normalized-diagonal basis, and readonly unsigned-long
natural-dimension getters returning density-corrected CSS-pixel components.
Exact WebIDL fractional-to-integer conversion, complete density correction and
the linked default sizing algorithm remain dependencies, not acquired proof.

CSS Masking is retained but not parsed: its CRLF response triggers a pre-parse
provenance-adapter assertion. This is not a demonstrated browser parser failure;
no source was altered and no failed acquisition/extractor was retried. A new
offline scope must correctly account for parser-normalized source positions
before claiming original-byte spans or clipping semantics.

Separately, one native XML parse identifies SQLite's real group clip:
`clipPath41` uses `userSpaceOnUse`, contains curved `path39`, and clips group
`g37`/gradient path `path53` under a Y-flipping matrix and ancestor translation.
The clip is not replaced by a bounding rectangle or stripped as redundant.
That source lane preserves an initial pre-parse import abort and its distinct
corrected entry point; its documented final verifier is `run-ready.py verify`.

The sealed handoffs and explicit gaps are in
`svg-intrinsic-clip-work-september13/primary-source/HANDOFF.md` and
`svg-intrinsic-clip-work-september13/sqlite-clip-structure/HANDOFF.md` beneath the
validation cache. They use native16711 source tooling, not a new renderer pass.
No credential, passkey-device, SafeJS, challenge or full live-site acceptance is
claimed by these checks, and the four originally requested research topics are
not completed by this SVG standards review.
