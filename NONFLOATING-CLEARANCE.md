# Native non-floating clearance

Normal blocks can now clear preceding physical floats before their text,
descendants and following static positions are laid out. This replaces the
blanket non-floating clearance rejection observed in the captured GnuPG replay;
it does not establish that GnuPG or another website now works end to end.

## Source-ordered layout

`FloatLayoutContext.clearanceBottom` returns the relevant prior left/right/both
outer margin-box bottom, or null when no matching float exists. It validates
the physical side and open state, charges work, and never places another float,
changes previous-top ordering or consumes an identifier. Zero and negative
bottoms remain distinct from no matching float.

The document coordinator queries the existing parent float owner before entering
the clearing block. It converts owner-relative bounds once and applies actual
clearance before text wrapping, glyph placement or child visits. A normal block
does not become an independent formatting context merely because it clears.
Following flow uses its final border origin and height; earlier lines and float
owners are not translated or duplicated.

Incoming collapsed sibling margins are separated only when clearance is needed.
The derived clearance is signed relative to the uncollapsed margin origin;
specified margins are unchanged. No matching float or an already-clear border
preserves the no-clear behavior. Ordinary outgoing margins still collapse.
Zero-strut empty clearing blocks advance flow, and enclosing through-state and
trailing margin summaries update accordingly.

## Leading ancestor margins

Independent review exposed two real positioning errors in an intermediate
candidate: an empty clearing wrapper allowed a later sibling's positive or
negative top margin to remain escaped into an already-positioned ancestor.
The cleared child and following sibling could look correct while ancestor
geometry was wrong. Both original geometry regressions remain unchanged.

The coordinator now prepares leading clearance before entering an affected
ancestor. Read-only floor queries use its already-entered float owner; scanning
stops at independent contexts or unplaced float contexts. A remembered actual
clearance updates leading top/through/bottom summaries before the ancestor
origin is resolved. This handles contributing first-child margins and the
reviewed later-sibling cases without moving previously laid-out content.

A second review found that an earlier speculative no-op could become real
clearance and advance the sibling cursor, making a later remembered floor stale.
Three unchanged regression fixtures reproduce that wrong upward movement in the
intermediate candidate. At real entry, a remembered leading-clearance decision
is now discarded and recomputed when preceding flow has made the boundary
non-leading. Valid signed ancestor-origin adjustments remain supported.

Unresolved escape dependencies beyond those preparation boundaries, nonzero
through-clearing margins and adjoining nonzero empty-margin chains remain
explicit refusals. Logical clear, independent CSS/deferred profiles and
float/flex/grid/table integration remain separate limitations. Work, ownership,
length and nesting ceilings are unchanged. This is bounded native behavior,
not verified full CSS conformance or cross-browser parity.

## Validation

An unchanged synthetic geometry/raster/hit fixture fails once on clean12094
at the original clearance guard. Four new suites add93 cases; final focused
validation passes422 cases with zero failures. Coverage includes physical sides,
outer float bounds, signed sibling margins, leading ancestor preparation,
source ordering, empty blocks, mutation, wrapping, static positions, malformed
coordinator results, work limits, source preservation and owner cleanup.

The final explicit-manifest selection passes **12,187 cases, zero failures and
two unchanged exclusions**, with231 selected suites,230 strict roots and625
clean manifest entries. Production build, strict checking and formatting pass.
This is a selected native gate, not a claim that every manifest suite ran.

UTC: 2026-09-12T07:01:11.762Z through 2026-09-12T07:03:44.753Z. Evidence is in
`node_modules/.cache/native-validation/native-nonfloating-clear-september12-round02`:
`AUDIT.json`,20 gate receipts, source/compiled ledgers and command outputs.
The audit verifies1121 source files,1944 compiled files and1109 unchanged tracked
inputs. Node22.22.0, private HOME/TMP and kernel socket denial are retained;
pre-existing working changes are excluded and preserved.

Earlier round00/round01 gates passed12095/12184 cases respectively, but omitted
later review regressions; neither is the final release. Both reviewed geometry
failures and all three stale-floor failures were reproduced before fixes.
The exclusions remain the separate total-host-object ceiling pressure case and
the pre-existing real unsupported-display/media case.

No real HTTP, credential/provider, passkey-device, TTY or SafeJS execution occurs
in the isolated gate. Current GnuPG/IANA/Netlib reports retain their original
runtimes and failed outcomes. A new scoped captured replay is required before
claiming any changed GnuPG flow outcome; a replay still is not a fresh live visit.
