# SQLite native SVG check — September 12, 2026

**Not a website pass.** One native navigation to
`https://www.sqlite.org/index.html` fetches three HTTP 200 responses, then stops
before document commit because the banner SVG is unsupported. A distinct offline
check identifies the first decoder gate as unsupported SVG CSS properties.

## Fresh live result

- Native runtime: `eaf47dc8a0e1081e31d86588c4c489c3b6d46429`, previously validated
  by 16,405 selected passing native cases, zero failures and two exclusions.
- Live supervisor: September 12, 2026, 22:57:19.697050–22:57:20.788425 UTC.
- Three original native GET/200 responses: `/index.html` (8,886 bytes),
  `/sqlite.css` (6,868), `/images/sqlite370_banner.svg` (12,707).
  Encoded and decoded totals are each 28,461 bytes; combined: 56,922.
- One navigation, zero commits/clicks/formatting/used-layout calls. The first
  failure, at 22:57:20.729 UTC, is `native-image-state: unsupported` for image
  `e24`; the subsequent navigation abort is secondary, not a replacement cause.
- No retry, redirect following, alternate browser/client, credential access,
  scripts, source stripping or challenge bypass. The server sends no CSP header;
  none is invented or removed. Observed owners close after bounded settlement.

The live check retains native TLS/public-address validation and truthful
`AgentBrowser/0.1` identity. Limits remain 32 GETs, one concurrent, 250 ms minimum
spacing, 2 MiB per response, 8 MiB combined bytes and 45 seconds plus five seconds
cleanup. Before/after checks verify 1,210 source files, 2,028 compiled artifacts,
27 tested inputs, 30 actual Git objects and 20 original gate receipts. Main's
read-only verification passes; the native suite and live check are not rerun.

Evidence: `node_modules/.cache/native-validation/native-sqlite-initial-september12/`.
Result SHA256: `da6bab2e4ac0b26c79c384720b2b95a599691f960f20fa563fce9f0f06641b39`.
The immutable SVG body has SHA256
`462c4ce8229b585dd6880cd308b121d9de63eb619db05e469598594e80d7b151`.
This known host does not expand the previously recorded 86-host inventory.

## Distinct offline diagnosis

Two separately scoped, network-denied checks use the exact captured image and
the same pinned runtime. Neither navigates, refetches or modifies the image.

1. Native XML parsing succeeds: 54 nodes, all 22 elements in the SVG namespace.
   The one direct native image-decode attempt stops at **“SVG image styles
   require an issue-free supported profile”**, before intrinsic-dimension or
   scene processing. No further decode attempt follows.
2. A separate native document/style census inspects 57 original declarations,
   using 350,503 charged work units and closing the standalone DOM to zero nodes.
   It reproduces **49 unsupported-property diagnostics**, including `fill`,
   `fill-opacity`, `fill-rule`, `stroke`, `stroke-width`, `stroke-linecap` and
   `stroke-linejoin`. These are real inline paint declarations, not optional
   metadata that can be removed to obtain a pass.

The native style owner converts the root's millimetre dimensions to
392.0672881889764×176.5935609448819 CSS pixels. The decoder currently requires
positive integer intrinsic dimensions, so fractional sizing is another known
compatibility gap; this is code/metadata analysis, not a second observed decode
failure. The XML also contains clipping and a real white stroke. Full acceptance
will require correct paint cascade, sizing and supported scene semantics, not
just ignoring the first diagnostic.

Offline evidence lives in `website-svg-work-september12/sqlite-svg-diagnostic/`
and `website-svg-work-september12/sqlite-svg-styles/` under the native-validation
cache. Original live and earlier decoder results remain unchanged. Broader
layout, interaction, visual-comparison, scripting and authenticated gates stay open.
