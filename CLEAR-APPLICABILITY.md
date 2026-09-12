# Native clear applicability

The formatting tree now records clearance only on applicable normal block-level
and floating owners. An inline link's computed `clear:left` remains intact, but
does not create a false block-clearance request. Boxless `display:contents`,
inline atomic boxes, absolute/fixed boxes and flex/grid items similarly retain
their computed declarations without acquiring inapplicable clearance metadata.

Root display normalization and float blockification are considered before
applicability. Normal block, list, flow-root, block flex/grid and table owners
retain clearance requests; this does not remove their independent layout guards.
The float coordinator also rejects forged nonfloating inline-level owners rather
than silently accepting invalid formatting input. Logical clearance remains an
explicit limitation for applicable owners, not for an ignored inline declaration.

## Motivation

The previous captured GnuPG replay on native12187 failed at `Clearance requires a
supported block owner`. A separate source-only probe identified six inline
anchors declaring `clear:left` and two genuine blocks declaring `clear:both`.
See `GNUPG-CLEARANCE-FOLLOWUP.md`. The change corrects applicability rather than
stripping site CSS, changing identity or removing the ownership guard.

## Validation

The unchanged synthetic geometry/raster/hit fixture fails once on clean12187
at the original owner guard and passes after the change. Three new suites add
67 cases; focused validation passes479 cases with zero failures.
Coverage includes computed values, display/position mutations, CSS-wide values,
root normalization, floating/block clearance, inline fragments, controls,
glyph positions, raster/hit checks, mocked link activation and owner cleanup.

The selected explicit-manifest gate passes **12,254 cases, zero failures and
two unchanged exclusions**:234 selected suites,233 strict roots and628 clean
manifest entries. Production build, strict checking and formatting also pass.
This is a selected native gate, not a claim that every manifest suite ran.

UTC: 2026-09-12T07:33:09.315Z through 2026-09-12T07:35:42.453Z. Evidence is retained in
`node_modules/.cache/native-validation/native-clear-applicability-september12-round00`:
`AUDIT.json`,20 gate receipts, source/compiled ledgers and command outputs.
The clean snapshot excludes pre-existing working changes. Node22.22.0, private
HOME/TMP and unconditional kernel socket/socketpair denial are retained.

Intermediate fixed01 passes408/fails5 on stale metadata assertions; fixed02
passes413 after preserving computed values while correcting inapplicable owner
expectations. The expanded fixed03 passes476/fails1 because the new split-inline
test requested already-unsupported client geometry. Its correction verifies
supported glyph placement and keeps that geometry limitation explicit, rather
than changing unrelated production geometry. Source review then found the missing
accepted `block table` alias: fixed04 passes478/fails1, reproducing its missing
owner metadata before the one-line applicability fix. The same assertion passes
unchanged afterward. All failed lanes are preserved.
The two exclusions remain total-host-object ceiling pressure and the pre-existing
real unsupported-display/media case.

## Limits and next checks

This is a focused native behavior change, not complete CSS conformance or a
working-GnuPG claim. Existing float/flex/grid/table, unsupported CSS, escaped
margin and resource/work guards remain. Block-in-inline client geometry is still
explicitly unsupported even where document glyph layout succeeds.

Source review also identified a separate pre-existing suspected omission in
float blockification for `inline flow-root`. It is not runtime reproduced and
is not changed by this patch; the owner check is not complete forged-tree
validation for every producer-supplied float/item/position combination.

Next is a separately scoped exact-capture GnuPG replay using the committed
release. Fresh BusyBox testing uses the earlier pinned12187 runtime and is not
evidence for this change. Netlib's center-element fallback remains separate.
The historical74-host inventory counts attempted hosts, not functioning sites.
Research completeness and credential/provider, device/passkey, TTY, real SafeJS
and challenge-handoff acceptance remain open; this gate does not exercise them.
