# Native inline top and bottom alignment

Retained inline atomic and replaced boxes support `vertical-align: top` and
`vertical-align: bottom`, alongside the existing `middle` profile. This includes
eligible generated atomic boxes, inline-block/inline-flow-root/inline-flex,
images, embedded SVG and native controls. Used block displays, floats, positioned
out-of-flow boxes and flex/grid items do not gain inline alignment metadata.
Other unsupported layout requirements remain guarded independently.

## Geometry

Top and bottom alignment uses the margin box, not the element's internal text
baseline. The border box starts at line top plus top margin for `top`; for
`bottom`, its lower border edge is line bottom minus bottom margin. Signed margins
remain signed, and padding/borders are already included in border-box dimensions.

Baseline-aligned text and ancestor struts establish the initial above/below
extents. Edge-aligned boxes contribute their margin-box heights separately. The
minimum line height is the maximum of the baseline-aligned extent, tallest top
box and tallest bottom box. The implementation first grows the above extent for
bottom boxes, then the below extent for top boxes. This deterministic policy
selects a minimum-height solution where the line baseline is underdetermined;
it does not assert universal pixel equivalence with another browser.

Pending float fitting and final line construction use the same extent resolver.
Actual fragments, downstream block placement, client rectangles, rasterization,
hit testing and click-point selection therefore consume the aligned geometry.
An edge-aligned atomic box does not require its internal baseline, while an
unrelated baseline-dependent child still preserves an unsupported-baseline error.
Replaced edge-aligned break opportunities use ancestor extents rather than the
replaced element's own font/line-height, which does not size its margin box.

## Limits and source

Non-atomic inline top/bottom/middle and their aligned-subtree propagation remain
unsupported. General inline alignment, sub/super, text-top/text-bottom and
length/percentage offsets are not added. Existing CSS, overflow, positioning,
direction and resource guards are not removed by this feature.

The native CSS 2.2 extraction captured on September 13, 2026, in
`node_modules/.cache/native-validation/native-inline-middle-source-september13/`
provides the margin-box, minimum-line-height and underdetermined-baseline rules.
Its returned Last-Modified date is April 8, 2016; this is neither a latest-standard
claim nor a new source fetch. No captured markup or styles are stripped.

Wikipedia's unchanged 119573-byte portal identified three real cases before this
implementation: bottom-aligned heading `e53`, top-aligned search wrapper `e234`,
and top-aligned rich button `e522`. Attribution alone does not prove full-page
geometry or a successful website interaction. Validation outcomes are recorded
separately after tests and unchanged-source replay.

## September 13 validation

The final isolated native gate passes **21,169 tests, zero failures and two
unchanged skips**: 413 selected files / 412 strict roots from 767 manifest entries;
354 entries remain unselected. Build, strict, scoped formatting and source
integrity checks pass. The two skips concern the existing host-object ceiling and
unsupported display beside advisory media; neither is new or hidden by this work.

There are 72 new cases: 68 in `src/inline-edge-alignment.test.ts`, two quirks image
alternatives and two relatively positioned generated boxes. Identical focused
tests improve from 925 passed / 62 failed to 987 passed / zero failed across
18 files. Initial incorrect fixture assumptions and obsolete guard expectations
are retained in failed evidence lanes, not excluded from the final test selection.

The unchanged Wikipedia replay at **21:28:05 UTC** removes the three remaining
inline alignment guards: total formatting issues 202→199, CSS issues unchanged
at132. Full geometry still fails on other requirements. This is zero-HTTP replay,
not fresh live acceptance; see `WIKIPEDIA-INLINE-EDGE-REPLAY-SEPTEMBER-13.md`.
