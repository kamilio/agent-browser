# Native legacy center elements

HTML `center` elements now have a block/text-centering fallback instead of being
deferred. Inherited internal alignment metadata distinguishes legacy descendant
placement from ordinary author `text-align:center`, which only aligns inline
content. The metadata does not introduce a proprietary CSS value or rewrite DOM.

The containing block's legacy alignment positions an ordinary child. An explicit
text-alignment override on that child changes its own content and descendants,
not its placement by the parent. Author display and text alignment, importance,
variables, supported CSS-wide values and namespace checks retain their precedence.
Alignment metadata invalidates with styles and clears when the document closes.

## Width and placement

The existing width solver distributes positive remaining space between both
non-auto used margins. This includes explicit zero, numeric, negative and
percentage margins, plus definite and min/max-clamped auto widths. Computed CSS
remains intact. Auto margins use their existing rules; overflow and zero extra
space keep ordinary directional overconstraint rather than forced centering.

Shared used coordinates drive text, geometry, raster and hit testing. Ordinary
block-level content, including supported replaced boxes, uses the same path.
Externally supplied widths remain authoritative; this path does not reposition
floats, absolute/fixed boxes, inline atomic roots or flex/grid items. Their normal
descendants still inherit legacy alignment where applicable. Existing independent
layout, source, numeric and work-limit guards remain.

Source review found no introduced blocker. It also noted an existing internal
representation distinction: replaced-size records retain resolved CSS margins,
whereas block-width records contain used margins after overconstraint/alignment.
Block geometry, painting and hit testing use the latter; this is not evidence of
a rendered-coordinate defect or a newly unified replacement-record API.

The design uses the WHATWG rendering description of alignment and primary
engine source as references, not another engine at runtime or a browser-parity
test. The original default-margin-only proposal was broadened to cover non-auto
author margins and clamped auto widths. Reference details and the superseded
proposal remain in the private center-element work lane.

## Validation

The canonical geometry/glyph/raster/hit fixture remains byte-identical to its
earlier baselines. It fails once on clean12254 in baseline02 at the unsupported
formatting-profile guard and now passes. Its earlier12094/12187 baselines remain
separate historical evidence. Three new suites add96 cases; final focused
validation passes564 cases with zero failures.

The selected explicit-manifest gate passes **12,350 cases, zero failures and
two unchanged exclusions**:237 selected suites,236 strict roots and631 clean
manifest entries. Production build, strict checking and formatting also pass.
This is a selected native gate, not a claim that every manifest suite ran.

UTC: 2026-09-12T08:01:42.676Z through 2026-09-12T08:04:17.105Z. Evidence is retained in
`node_modules/.cache/native-validation/native-center-element-september12-round00`:
`AUDIT.json`,20 gate receipts, source/compiled ledgers and command outputs.
The audit verifies1127 source files,1944 compiled files and
1119 unchanged tracked inputs. The clean projection preserves pre-existing
styles import/order edits without including them in this release. Node22.22.0,
private HOME/TMP and unconditional kernel socket/socketpair denial remain.

Intermediate fixed00 passes427 cases. Adding the existing nonfloating-clearance
suite produces468 passes/one failure in fixed01: its old independent-guard case
still expected center to be unsupported. Replacing only that stale negative
fixture with a still-deferred fieldset restores469 passes in fixed02 while
preserving the independent-guard assertion. All intermediate lanes are retained.
Expanded fixed03 passes557/fails2 on new negative-test assumptions: generic
align attributes still block geometry,and raw table/grid formatting diagnostics
are not automatically blocking after coordinator support. The corrected cases
retain explicit unsupported guards while distinguishing already-supported table
and grid profiles; no production guards are relaxed to satisfy these tests.
The two exclusions remain total-host-object ceiling pressure and the pre-existing
real unsupported-display/media case.

## Website and remaining gates

This change is motivated by the historical failed Netlib native flow, whose
census retained a deferred center element. That live report is unchanged and is
not sole-cause proof. A fresh, separately scoped Netlib flow must use the audited
committed release before website acceptance can be claimed.

General HTML `align` attributes, independent unsupported CSS/table/presentation
profiles and other browser limitations are not silently enabled. The75-host
inventory counts attempted hosts, not working websites. Research completeness,
credentials/providers, passkey devices, TTY, real SafeJS and challenge handoff
remain separate open acceptance gates. No identity rotation or bypass is added.
