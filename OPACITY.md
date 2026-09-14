# Native group opacity

The standalone engine computes `opacity` and composites an element with its
descendants as one native raster group. It does not fade each glyph, background
or child independently, and does not replace unsupported-layout checks with
parser-only acceptance. No browser engine or runtime dependency was added.

## Style and geometry

- Finite CSS numbers and percentages compute to a value clamped to `[0,1]`.
  Opacity is non-inherited by default; explicit `inherit` uses the parent value.
  Initial/unset/revert produce the initial value through the existing cascade.
  Computed CSSOM exposes a numeric string, including `1` for the default.
- Stylesheet, inline-style, supports queries and SVG presentation attributes
  share the value path. Unit opacity is omitted from internal paint objects and
  does not allocate opacity layers. Unsupported math syntax remains unsupported.
- Values below one create a stacking context without establishing a new
  absolute/fixed positioning containing block. Positioned descendants remain
  inside that context for painting and hit ordering.
- Opacity zero preserves layout, hit eligibility and native click dispatch.
  Hidden, inert, disabled, covered and pointer-events checks still apply.
  Transparent groups do not bypass unrelated unsupported-content admission.
- Style changes invalidate prepared rasters and existing geometry/style caches.
  No password, provider, passkey or page-runtime behavior is exercised here.

## Group painting

Each group paints into a transparent offscreen surface at the capture's size,
then composites source-over into its parent using the group's alpha. Nested
groups preserve their independent compositing, including overlapping content.
The group includes ordinary backgrounds, borders, outlines, generated content,
text, selections/carets, native controls and replaced content on the shared
document raster path. PDF output uses that same raster path.

The root's propagated canvas background is painted inside root opacity. A body
background propagated to the canvas is not independently faded by body opacity.
Captioned table roots use their actual anonymous wrapper as group owner rather
than losing opacity when the referenced table is reparented. Inline fragments
across lines share their formatting owner's group.

Rounded/overflow clipping remains attached to the current paint destination.
When switching groups, the renderer releases its prior destination and cached
clipping views before replacement allocation. Stable destinations retain their
cache. Completed groups cannot be reentered and silently painted twice.

## Resource limits

- Existing raster dimension/pixel and document work limits remain unchanged.
- Managed opacity backing buffers are limited to **16,777,216 simultaneously
  retained pixels**: 64 MiB of RGBA bytes, separate from the output canvas,
  image assets, metadata and other process allocations.
- Allocation and compositing charge the existing document raster work budget.
  Surface limits are checked before the next allocation. This is bounded
  retained-buffer accounting, not a measured process-RSS guarantee or a promise
  about garbage-collection timing.
- Metrics expose `opacityGroups`, cumulative `opacityPixels` and
  `opacityPeakPixels` when grouping is used. Ordinary unit-opacity captures
  retain their prior metric shape. Full capture-size surfaces are used; tight
  per-group cropped surfaces remain a future memory/performance optimization.

## SVG integration and limits

CSS opacity and presentation attributes now share the SVG cascade, including
CSS overrides and explicit resets to one. Existing SVG shape fill/stroke
isolation uses the resulting alpha. The HTML renderer explicitly tells
`documentSvgScene` when it owns outer SVG opacity, avoiding double application;
the default scene API never silently discards an outer effect.

Internal nonunit SVG group opacity remains explicitly unsupported until that
separate scene pipeline supports actual group compositing. External SVG images
retain their independent root/group restrictions. Existing malformed-attribute,
clip, fill/stroke and resource guards remain.

Other explicit limits include opacity across block-in-inline splits and opacity
on individual collapsed-border owners. Those independent layouts fail closed
instead of applying opacity per fragment or missing shared borders. Unsupported
transforms, filters, blend modes and isolation are not enabled by this feature.
This is not a claim of complete CSS/SVG conformance.

## Verification

Final `release01` ran **September 14, 2026, 13:42:28.876–13:48:43.981 UTC**:
**23,757 passing cases, zero failures and the same two explicit exclusions**,
across 477 selected files. Build, 476-root strict checking and existing formatter
checks pass. The audit verifies 23,514 unchanged baseline case occurrences,
including their two exclusions, one explicit unsupported-fixture migration,
and **244 newly passing cases** in the seven opacity suites. The total host-object
ceiling and advisory-media/display cases remain excluded, not passed.

Same-source `controls01` passes **508 cases**: those 244 feature cases plus
264 additional existing control cases. Both complete source and compiled
inventories match the final release, yielding **24,021 unique passing case
occurrences** across the two selections without double-counting the feature
tests. `focused05` separately passes **859 cases**. All final snapshots contain
2,925 source files; the broad gate emits 2,200 compiled files. These counts are
not a claim that every repository test or external acceptance gate ran.

Original execution lane: `/dev/shm/agent-browser-opacity-september14/`, based on
clean commit `5e18c1dd9318a9105fafec4dcf40a9f0730a7814` rather than pre-existing
dirty work. `release01/AUDIT.json` records exact selections, hashes, the single
case migration and supplemental identity checks. Durable evidence is retained
under `node_modules/.cache/native-validation/opacity-september14/`; copying it
does not constitute another run or alter its original paths and measurements.

Seven new native suites cover values/CSSOM, low-level alpha precision, document
pixels, stacking, layer lifecycle/bounds, real synthetic click navigation and
SVG integration. All transports and documents in those suites are synthetic.
No live website, socket, real terminal, SafeJS, credential or device probe is
implied by their results.

Independent review found and corrected the captioned-root ownership and retained
destination-reference issues. Their regression tests and static follow-up are
recorded in the isolated `opacity-september14` evidence lane. Earlier strict,
native and authoring failures remain unchanged; they do not validate later edits.

Two existing expectations intentionally change: `CSS.supports('opacity','.5')`
now succeeds, and an unsupported-hit-effect fixture uses `filter:blur(1px)` rather
than now-supported opacity. The final audit records that one case-identity
migration separately; it is not silently counted as an unchanged old case.

Official W3C lookup attempts in this implementation turn returned no usable
source text. They are not claimed as verified standards evidence or native
website observations. Synthetic results establish the tested native behavior,
not full external conformance or current website compatibility.

## Website follow-up

The earlier captured Wikipedia diagnostic identified actual opacity declarations,
including fractional values, but still failed supported search geometry.
Implementing this feature is not itself a fresh Wikipedia observation. A new
captured check must use the committed, audited runtime and retain separate
scope, results and remaining blockers. Layered backgrounds, clipping, broader
research, live-site behavior and the overall browser goal remain open.
