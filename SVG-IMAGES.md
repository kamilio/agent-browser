# Native static SVG images

September 12, 2026. The native image pipeline now decodes a bounded static subset
of `image/svg+xml`, including the actual retained IANA header logo and Python
favicon. This fixes their previously unsupported image format; **it is not a new
live website acceptance result**. The captured-body check made no HTTP requests.

## Implementation

- `src/svg-image-xml.ts` parses UTF-8 XML 1.0 with strict names, namespaces,
  references, document structure and fixed resource limits. It does not use HTML
  error recovery. External PUBLIC/SYSTEM declarations remain metadata and are
  never fetched; internal DTD subsets and unresolved external declarations are
  explicit unsupported boundaries. This is not a complete XML processor.
- `src/svg-image-document.ts` creates a standalone SVG-native document without
  an HTML wrapper. It preserves representable case, attributes, text and comments;
  it rejects unsupported foreign elements or processing instructions rather than
  deleting meaningful subtrees. Partially built documents close on failure.
- `src/svg-image-decoder.ts` applies the native CSS cascade, scene construction
  and rasterizer under one decode-work budget. Its document closes in `finally`.
  For this first image profile, both computed intrinsic dimensions must be
  positive integer absolute pixel sizes; it does not invent a universal fallback.
- Native stop-color/stop-opacity declarations support presentation attributes,
  inline/author CSS, importance, variables and explicit inheritance. Defaults are
  noninherited black/one. Existing initial paint object identity is preserved.
- Linear gradients support same-document references, user-space or object-box
  coordinates, gradient transforms, pad/repeat/reflect, normalized stop order,
  overlapping stops, one/no-stop and zero-vector behavior. Stop paint comes from
  the paint server's cascade, not from the referencing shape's color.
- `src/svg-linear-gradient.ts` uses inverse-affine sampling, including transformed
  gradient normals under nonuniform scaling/shear. sRGB channels and alpha
  interpolate without premultiplying RGB. Shape/viewport/raster transforms stay
  aligned; existing solid-color scanline painting retains its fast path.
- `decodeImage` and the existing resource owner expose SVG through their shared
  MIME list, Accept header, caching, layout, pixels, CSP and resource limits.
  The existing JPEG/PNG/GIF ordering and behavior remain covered by regression
  tests. No dependency or page runtime was added.

SVG image scripts remain inert and are not fetched or executed. External image,
stylesheet, gradient-template and other unsupported paint dependencies do not
silently become successful flat images. Native fixtures cover CSP-before-fetch,
single-resource sharing, decode/pixel limits, script isolation and cleanup.

## Native validation

Frozen candidate:
`node_modules/.cache/native-validation/native-svg-image-september12-round00/`.
Its source base is `e3e1b25244ff679378ff3e890be83f22b9c944cd`.

- Build, strict TypeScript, Biome and selected native regression gate pass.
- **16,405 passed, 0 failed, 2 unchanged exclusions**; 459 new cases in nine
  new test files. Final focused check: 1,145 passed in 24 selected files.
- 315 selected suites and 314 strict roots from a clean 693-entry manifest.
  The other 378 manifest entries were not executed by this gate.
- 1,210 frozen source files, 2,028 compiled artifacts and 1,183 unchanged tracked
  inputs. The 26 owned source/test inputs exclude the pre-existing reorderings
  in `css-declarations.ts` and `computed-styles.ts`.
- Gate interval: **22:25:15.172–22:29:08.288 UTC**. Audit: **22:29:48.343 UTC**.
  Pinned Node 22.22.0; private HOME/TMPDIR; kernel network denial and the existing
  native test guard. No live, credential/provider/device, TTY or SafeJS gate ran.

The two exclusions remain the total host-object ceiling case in
`focus-provisioning-pressure.test.ts` and the unsupported-display/advisory-media
case in `media-fallback-layout.test.ts`. No new exclusion was introduced.

Hashes:

- Source inventory: `e8243984e95e414e92878df1ae6bd7a29cbb8ab034038b56e87cd9438bf1e453`
- Compiled inventory: `2fb690363394f68ffdff78156b901b80b3b90f2d2255807b4e46388b208162b5`
- Native results: `abcd700ef187b7066a01e1eb4971e0a5ebc1301557f367b3b32d2b431d48fa69`
- Audit: `1e9b1f2435db73e3b80519bf66f969087e8426299c4871262a29b704d7fea780`
- Gate receipts: `5f5a0cc01e42a1623d610af460479315c9627357d5f2493020eac936d885215b`

## Actual captured SVG check

Evidence:
`node_modules/.cache/native-validation/svg-image-work-september12/captured-svg01/`.
The audited precommit candidate ran **22:30:16.152–22:30:16.300 UTC** with two
independent single-body decode attempts, no HTTP, no navigation and no retries.
Both used the existing image-owner limits of 33,554,432 decode work units and
4,194,304 pixels. Full source/compiled ledgers verify before and after.

| Retained public SVG | Bytes | Native raster | Shapes / XML nodes | Decode work | Nontransparent pixels / colors |
| --- | ---: | --- | --- | ---: | --- |
| IANA header logo | 32,870 | 234 × 72 | 40 / 133 | 1,873,744 | 3,146 / 135 |
| Python favicon | 2,041 | 16 × 16 | 2 / 24 | 121,150 | 176 / 122 |

IANA's external SVG 1.1 doctype was retained but not loaded. Both outputs contain
varying gradient colors, not substituted flat paint. Main viewed the generated
native PNGs; this is artifact inspection, not another browser or a golden-image
comparison. Existing raster antialiasing limitations remain.

Exact original bodies and SHA-256 values:

- `node_modules/.cache/native-validation/native-iana-image-csp-september12/response-3.body`:
  `888b41c392a51d5aa6ca6df224e345f74ffbb97a48422753a3e4f90f305d0004`
- `node_modules/.cache/native-validation/native-python-fresh-initial-september12/response-3.body`:
  `5865be8bcc0af888594903ea0112f6c8d923c5726c4081e8c856110cc7339cef`

The Python body is from the fresh eight-response capture, not its older capture.
Neither original body, capture path, timestamp nor first failure was rewritten.

Output PNGs:

- `captured-svg01/iana.png`: `3c164354c2517d23229938eee1f8ae5a8d50ab72e30b9151da778762f333c08d`
- `captured-svg01/python.png`: `3b6c75cf9fac9be27d44d77a79ab631449ee0487119fd1102d10016304a99d2a`
- `captured-svg01/RESULT.json`: `f124cd5cb497d897a470bb12b5bbd0d4d00f30bb05ee8003daff965848e0aff6`

The child exits zero with empty private HOME/TMPDIR and releases its returned
raster references. This check does not independently observe the decoder's
private DOM cleanup; focused tests observe its success/error `finally` cleanup.
The run is precommit; subsequent commit verification must establish byte identity,
not relabel it as a run of an already committed binary.

## Research and retained failures

All primary acquisition used the existing native browser, not another engine.
Seven W3C source GETs cover XML, namespaces, SVG secure-static rules, CSS image
sizing, SVG coordinates/paint servers and color interpolation. Separate bounded
retained-body reads resolve nested grammar/stop/processor rules. Native semantic
extraction limitations and initially missing containers remain in their original
reports. This is targeted SVG research, not completion of the other research topics.

The seven corpus/source lanes and exact extraction hashes are recorded under
`svg-image-work-september12/` in `corpus-review`, `primary-source`,
`gradient-sizing-source`, `xml-grammar-source`, `gradient-rules-source`,
`color-space-source` and `xml-constraint-followup`. Main's independent read-only
verification of all seven passed at 22:23:32.463–22:23:34.744 UTC;
`main-research-verification/RESULT.json` has SHA-256
`ab26ee04e187862f1c9f9ad049fd6d8d7e684faabab3c461ad23654717f440bd`.

Intermediate native failures remain recorded: unresolved unused root paint in
`scene02`, obsolete MIME/Accept expectations and an incorrect script-rejection
expectation in `scene04`, and the worker-specific failed rounds. The shared
synthetic SVG fallback fixture now includes explicitly unsupported text; it no
longer mislabels a supported plain rectangle as a decoder failure. Existing
fallback assertions remain, and new tests cover successfully decoded rectangles
and gradients. No historical measurement or failed test log was overwritten.

`captured-svg00` retains a harness import-path failure: the build emits
`dist/src/`, not `dist/`. It failed before either SVG body was read or decoded.
The corrected fresh lane contains the first actual body attempts. The full-gate
audit was not rerun.

## Outstanding boundaries

Fresh complete IANA/Python website flows remain to be tested. A decoded captured
logo does not establish document commit, layout, link navigation or site acceptance.
The prior IANA live failure remains documented in `IANA-IMAGE-CSP-NATIVE-CHECK.md`.

Remaining SVG work includes natural sizing without two absolute integer dimensions,
MIME charset handling beyond the UTF-8 profile, text/strokes/filters/masks/clipping,
foreign elements, author-CSS fill paint, gradient templates and linearRGB transfer
functions. Singular/ill-conditioned gradient transforms fail explicitly. There is
no animation or external SVG resource loading, and no full SVG/XML conformance
claim. Existing live credential providers, real passkey devices, TTY/SafeJS and
challenge/restriction acceptance gates remain open in `TASKS.md`.
