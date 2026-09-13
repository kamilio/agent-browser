# Native inline middle alignment

September 13, 2026. This implements actual `vertical-align:middle` geometry for
retained inline replaced boxes and atomic inline containers. It does not implement
all vertical alignment or turn a blocked website into an accepted page by removing
its diagnostics.

## Geometry and ownership

The aligned rectangle is the margin box. Its vertical midpoint aligns with the
parent baseline raised by half the parent's x-height. For downward-positive
coordinates, the border-top-to-baseline offset is:

```text
marginHeight = marginTop + borderHeight + marginBottom
baselineOffset = (marginHeight + parentXHeight) / 2 - marginTop
borderTop = parentBaseline - baselineOffset
```

The implementation uses the existing `nativeFontXHeight`, derived from the native
font's x glyph, font size and weight. It does not substitute the child's font,
half the font size, or the center of the final line box. Border and padding are
inside the border height; signed margins remain outside it.

Tokens contribute their aligned upper and lower margin edges to the line extents
alongside the parent strut. The same offset positions fragments, so line height,
following blocks, raster output, geometry, hit testing and actionability use the
actual alignment rather than a paint-only displacement. Wrapping retains each
line's own extents.

Formatting metadata is attached only to eligible retained inline replaced or
atomic boxes after ownership/remapping is resolved. Images, otherwise supported
SVG/control boxes, inline-block/inline-flow-root and inline-flex use that path.
Supported generated atomic boxes retain their original owner without inventing
a DOM reference. Blockified/floating boxes do not gain inline displacement.

An atomic's internal baseline is not needed to middle-align its margin box.
Where an enclosing atomic already has actual text-line baselines, an unknown
middle child's internal baseline no longer invalidates those known line baselines.
The collector does not invent or globally clear the child's baseline state.
Baseline-dependent inline-flex, no-line-box propagation, unrelated unsupported
siblings and internal flex baseline guards remain distinct.

Implementation: `src/inline-middle.ts`, `src/text-layout.ts`,
`src/formatting-tree.ts`, `src/flex-placement.ts`.
Regressions: `src/inline-middle.test.ts`.

## Explicit limits

Ordinary non-atomic inline middle alignment remains guarded. Parsed top/bottom
alignment is not implemented here; unsupported values such as `text-top` retain
their CSS value diagnostic and do not replace a preceding valid declaration.
Other layout/CSS/image/overflow/writing-mode restrictions are not bypassed.
Existing native control baseline fallback is not promoted to platform-widget
conformance by this feature. General flex/grid/table-cell baseline semantics,
font loading and reference-browser pixel equivalence are outside this change.

## Primary-source evidence

The native browser fetched the CSS22 visual-formatting-details document once on
September 13, 2026: HTTP 200, 87,037 decoded / 16,235 encoded bytes. The response's
Last-Modified date is April 8, 2016; this is a fresh capture of that document,
not a claim that it is the latest specification. One live native parse and one
kernel-sealed offline parse retain the margin-box, parent x-height, line-extents
and baseline distinctions. One query and 12,098 excerpt units are retained.

No source rewrite, style stripping, extra assets, scripts, geometry or raster
was used for this source read. The mathematical translation above is an
implementation inference from that text, not a measured reference rendering.

Evidence under `node_modules/.cache/native-validation/`:
`native-inline-middle-source-september13/EXCERPTS.json`, its `EVIDENCE.sha256`,
and `inline-middle-work-september13/SOURCE-HANDOFF.md`.
Source body SHA256:
`254bb76539cdde3070f7b0821dc9154efdc9b332a89e532359c6a8fd9d9dc732`.
Root evidence ledger:
`f8be2490ac9b859bcdd2e41facaaf7d529abc120e843dd38be83f793054b3d7f`.

## Validation

The final focused pair has identical tests: old production **741 passed / 44
failed**, candidate **785 passed / zero failed**, with no skips. All 55 new cases
pass on the candidate; 44 fail on old production and 11 preserve existing behavior.
Coverage includes real line/fragment geometry, pixels, hit testing, actionability,
parent fonts, signed margins, wrapping, percentage padding, generated boxes,
remapping, baseline dependency boundaries, mutation and resource budgets.

Earlier failed lanes remain intact. One new test wrongly expected `text-top` to
be retained; two later negative tests wrongly assumed unavailable baselines where
existing text/control fallback already supplies one. Those test expectations were
corrected without parser changes or new production restrictions. The separate
nested middle inline-flex propagation failure was actually reproduced and fixed.
Three old table-formatting negative fixtures now use still-unsupported top
alignment; none is removed or skipped.

The broader gate completes at **20:47:46.337–20:52:41.223 UTC** with **21,097
passed / zero failed / two unchanged skips**. It selects 412 files / 411 strict
roots from 766 manifest entries, leaving 354 unselected. Build, strict, scoped
format and immutable source checks pass. The two exclusions remain the existing
host-object-ceiling and unsupported-display/advisory-media cases. Audited inputs
are 1,308 source and 2,128 compiled files, including source/declaration maps;
1,301 unowned tracked inputs match parent `ee27022`.

Gate: `node_modules/.cache/native-validation/native-inline-middle-september13-round00/`.
Its audit SHA256 is
`307e32b32f511833185f0628dd3595c0414a47f3bc9c0fcc670ba6e86767e397`;
20-receipt ledger:
`1f434980f05634ca3ccb43b729bf639d4edec8db7d9a95dd35ff8bfe8bdd1dbb`.

These tests do not establish Python/Wikipedia navigation, fresh live compatibility,
repeatable performance or separately authorized credential/device/SafeJS/socket/
TTY gates. Unchanged captured-page replays measure remaining website blockers
separately, without promoting fewer diagnostics to full-page acceptance.
