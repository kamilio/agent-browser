# Native single-layer background images

This September 14 implementation extends the historical solid-background
checkpoint without adding a browser engine or runtime dependency. It implements
actual image loading and pixels, not only declaration acceptance.

## Supported profile

- One case-preserved URL image, with the existing native PNG/JPEG/GIF/static-SVG
  decoders. Relative URLs retain stylesheet, redirected stylesheet, imported
  stylesheet or live inline-document base provenance. Custom-property URLs resolve
  at the consuming declaration; inherited image URLs remain resolved.
- Position uses one/two keywords or finite px/% values, including negative
  offsets. Size supports auto, contain, cover and one/two nonnegative px/%/auto
  components. Zero rendered dimensions produce no image pixels.
- Repeat, no-repeat, repeat-x, repeat-y and independent repeat/no-repeat axes;
  border-box, padding-box and content-box origins/clips; scroll attachment.
  Supported shorthand clauses reset all eight components atomically. CSS-wide
  initial/inherit/unset/revert and live inline/computed CSSOM retain real values.
- Visible block, replaced, atomic generated-pseudo and HTML canvas painting.
  Color is below the image and borders; rounded/overflow clipping is retained.
  Canvas propagation does not double-composite root/body images or propagate
  body color through a non-none root image. Existing nearest-neighbor sampling
  also applies to the decoder's static SVG raster.

## Ownership and limits

Backgrounds, before/after pseudos and img elements share DocumentImages resource
deduplication, policy checks, decoding, origin-clean metadata and existing
request/concurrency/byte/work/entry limits. Backgrounds do not dispatch img
load/error events or replace an img element's natural dimensions.

The native document loader defers background discovery until its initial
stylesheets are installed. Direct image owners default to immediate discovery;
the optional deferBackgrounds setting and enableBackgrounds method expose that
bounded lifecycle explicitly. A redirected sheet's source URL remains separate
from its requested link identity; the import loader's source-ownership checks
are not bypassed.

Style/base/display/pseudo changes invalidate discovery. Reconciliation retains
resources through consumer transfers and URL swaps before releasing unused
resources; detached img ownership is preserved. Image completion invalidates
prepared raster state. Pending images cannot be presented as completed capture
pixels. Broken/policy-denied images remain observable through the image owner.

Tile ranges are derived from the visible raster rather than traversing arbitrary
offscreen repetitions. Numeric, tile and pixel work is bounded and charged before
painting. Existing resource limits are not raised.

## Explicit boundaries

This is not complete CSS Backgrounds conformance. Gradients, multiple layers,
escaped/empty URLs, unsupported units/math, round/space repeat and fixed/local
attachment remain rejected. Image-bearing non-atomic inline fragments, native
controls, special table/collapsed-border owners and fieldset-legend backgrounds
remain fail-closed during rasterization. No image animation, new SVG subset or
color-management support is implied.

The original MDN 19-response corpus and its failed ordinary-click evidence remain
unchanged. Synthetic native results are not a fresh website, socket, SafeJS,
credential/provider, physical passkey or challenge-handling acceptance run.

## Evidence

- Final isolated build, strict types, scoped formatting and native tests pass
  **23,335 / 0 failures / 2 unchanged exclusions**, September 14, 2026,
  **11:36:32.922–11:42:08.743 UTC**. The explicit selection contains 465 files
  (464 strict roots), from 817 manifest entries; 352 remain unselected.
- Independent audit preserves all **23,099 prior case occurrences**, including
  both exclusions, and verifies **238 new passing cases**. It checks 2,899 source
  inputs, 2,192 compiled files and unchanged unowned candidate files.
- Focused validation passes 3,190 cases at 11:26:33 UTC. Later lifecycle,
  capability and support-query additions are covered by the final gate.
- Coverage includes URL/cascade/CSSOM provenance, exact pixels and rounded clips,
  zero content origins, bounded tiling, CSP/redirects, deferred loading, resource
  transfers/swaps, detached img ownership, pending-paint staleness and ordinary
  pointer clicks with cancellation. Six new suites are explicitly listed in
  native-tests.json; no dependency or runtime-engine change is involved.

Original evidence is under
`/dev/shm/agent-browser-css-images-september14/`; the final gate is
`release01/`, with `SUMMARY.json`, `AUDIT.json`, `SELECTION.json`,
source/compiled hash inventories and complete native results. Durable retention
is `node_modules/.cache/native-validation/css-background-images-september14/`
(the complete compressed lane and an identical uncompressed final gate).
Retention verification is not another execution.

All unsuccessful stages remain in the evidence: focused00 lacks the dependency
resolution symlink; focused01 catches a new test's import-loader wrapper type;
focused02 reports 3,157 passes/18 failures, exposing URL lowercasing, loading/base
provenance and accounting/fixture problems; focused03 reports 3,114/72 when an
incorrect hand-built stylesheet source is rejected by the import owner. That
attempt is replaced by preserving the final URL in the existing external-sheet
path, not weakening source ownership. Focused04 passes 3,190/0.

Release00 reports 23,331 passes/1 failure/2 exclusions: the remaining failure is
an obsolete CSS.supports expectation that URL backgrounds are unsupported.
Release01 updates that expectation and adds three support-boundary assertions.
Three obsolete shorthand-rejection inputs and one component-boundary test in
css-background.test.ts are updated to still-unsupported multi-layer/four-value/
round/text-clip cases; the audit records their label mapping. No prior test
occurrence is dropped, no exclusion is promoted and no resource cap is raised.
