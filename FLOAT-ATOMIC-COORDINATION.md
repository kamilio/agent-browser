# Native inline-block and float coordination

The native page float path now coordinates ordinary inline-block measurement,
text wrapping and placement instead of rejecting every document containing both
floats and inline-blocks. The motivating GnuPG capture contains inline-block
navigation items and floated footer content; independent site CSS limitations
remain separate from this implementation.

## Shared layout path

Inline-block owners retain their intrinsic/shrink-to-fit widths, box edges,
baseline metrics and isolated descendant documents. The float coordinator uses
those atomic metrics when resolving text line intervals around actual floats,
then merges their measured descendant boxes, text contexts, image ownership and
physical placement into the resulting document.

`layoutFormattingFloatFlow` shares the coordinated horizontal-to-document phase
between a floated document scope and an inline-block containing floats. This
supports both inline-blocks inside floats and floats inside inline-blocks; their
independent formatting scopes are not flattened into the surrounding scope.
Atomic documents without child floats retain their existing flex-flow path.

Auto-width atomic and floating ancestors now recursively measure floating-child
intrinsic contributions before used-width resolution. The intrinsic text input
has an explicit `intrinsicFloats` list of retained physical-float IDs and measured
outer widths. These are measurement-only values, not substitute used placements.
Duplicate/nonphysical IDs and invalid or oversized lengths are rejected.

Minimum-content measurement permits breaks around floating contributions, while
preferred-width measurement accumulates their widths with inline content. A
clearing float starts a new preferred-width group, retaining opposite-side
contributions that it does not clear. Margins, padding and borders come from the
child's measured contribution. This is a bounded native intrinsic-sizing policy,
not a claim of complete CSS sizing or height-dependent float-packing parity.

Floated child lines no longer supply a parent's inline-block baseline. The float's
own baseline records, rendered boxes and height containment remain available;
normal-flow child lines still determine the parent baseline. An otherwise
line-less inline-block uses the existing bottom-margin-edge fallback.

The measured float callback propagates the greater inherited/atomic nesting
depth before entering another float. Existing work, nesting, geometry-number,
text retention and placement limits remain in force. The horizontal resolver
receives an explicit coordinated-layout callback; unexpected flex/grid/table
shells still throw rather than being silently skipped.

Flex, grid, table, non-floating clearance and independent unsupported CSS
profiles remain guarded. This change neither strips styles nor substitutes a
forced click for physical actionability. Page-level relative positioning and
outside-marker coordination remain owned by their existing callers.

## Verification scope

An unchanged minimized fixture places a12px red inline-block beside an8px blue
left float in a32px container. The old release fails at its combination guard;
the new path verifies the actual rectangle, red raster pixel and physical hit
target, with document cleanup. The initial prototype also exposed and fixed a
missing coordinated-width callback; its failed run remains recorded.

Five new suites add85 cases. Final focused testing passes534/0, including nested
ownership, auto widths and clearance groups, line baselines, actual rectangles,
raster/hit consistency, mutation invalidation, preserved absolute-positioned
blockification, limits, immutable inputs and a genuine mocked native control click
with cleanup. The baseline fixtures remain distinct from full-site validation.

Failed intermediate checks remain recorded: the missing coordinated-width
callback, an incorrect assertion that an already-supported absolute-positioned
profile should fail, the outdated table/float error string, and the two review
findings (floated-child baseline leakage and unmeasured auto-width float content).
The latter were reproduced before their fixes. The old nested-auto-float
rejection now checks successful measured widths; independent guards remain.

The final clean-source gate passes **12037 tests, 0 failures and 2 unchanged
exclusions**, September12,2026,05:59:59.772–06:02:30.366 UTC. Source build,223
strict roots, scoped formatting and224 selected native suites pass. There are618
clean manifest entries, not618 executed suites. The two exclusions remain the
total-host-object-ceiling pressure case and the real-unsupported-display media
case.1114 source and1944 compiled files are audited;1101 non-owned tracked inputs
match the base commit. Source inventories remain unchanged during validation.

Final evidence lane:
`node_modules/.cache/native-validation/native-float-atomic-september12-round02`.
Source ledger SHA256:
`eb7269a4e836d8ef85e6b06f87c89008959a2f317ca1dfa8caba80d2baa13380`.
Compiled ledger SHA256:
`fa71f79779777c219454373067d8d9a11f2541e7b8596871ef4ffc6f05cd3462`.
Native results SHA256:
`89c2586e156fe12ca96a34329b6140c79cc5325ad81eaf176c3d6d6be4289278`.
Audit SHA256:
`8c0e160fcd5ceed46351fb3e7f97f27b6a7da7304209aa357e30b312261f89ca`.
Gate receipts SHA256:
`b30d8f04ab3ba742fcdcfc101d7d7cc3563fad52da2cf7b3c4e202c2a7d22db7`.

Native fixture success is not a fresh GnuPG flow: the capture's remaining CSS
diagnostics and any further independent profile limitations need their own
follow-up checks. No live website, credential/provider, passkey device, TTY,
realSafeJS or challenge bypass is exercised by this code gate.
