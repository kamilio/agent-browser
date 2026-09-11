# Grid overflow alignment follow-up

September 11, 2026. Follow-up to the block Grid implementation in 32dcce4,
not a rewrite of GRID-LAYOUT.md or the frozen MDN replay.

## Reproductions and correction

The read-only review produced two reproducible alignment defects:

- Overflowing space-around/space-evenly track groups used negative centering
  offsets. Their fallback now remains at the safe start edge in either axis;
  positive distribution and space-between retain their existing behavior.
- Auto block-axis margins suppressed self-alignment even when free space was
  negative and the margins resolved to zero. Only positive free-space absorption
  now suppresses self-alignment. Explicit unsafe end/center can overflow toward
  the start; safe alignment still clamps to the start edge.

Twelve regression cases cover both axes, all three distribution modes, positive
free space, one/two auto margins, unsafe and safe alignment, and positive margin
absorption. The preserved baseline has **23 passes and five failures**; after the
two production corrections, all **28 focused Grid layout cases pass**.

Artifacts are overflow-baseline.stdout and overflow-fixed.stdout under
node_modules/.cache/native-validation/native-grid-layout-work-september11/.
The failed baseline is retained unchanged; no assertion is excluded to pass.

## Validation and source scope

Clean tracked32dcce4 plus only src/grid-layout.ts and src/grid-layout.test.ts
passes **8,107 native cases, zero failures and one existing excluded assertion**,
across131 selected files/130 strict roots. Build, strict typing and formatting
pass; all1,017 source files remain stable. The gate runs September11,2026,
13:51:11.185–13:52:55.539 UTC in
node_modules/.cache/native-validation/native-grid-overflow-september11-round01/.
Historical snapshot strict-only and total-host-object-ceiling runtime exceptions
remain unchanged. This is not live website, socket, TTY, SafeJS or credential
acceptance, and the MDN Grid layout replay does not include this later fix.

Two native offline source extractions are preserved in
native-grid-overflow-source-september11 beneath the same cache root. Grid10.2
confirms the zero-auto-margin/continued-alignment rule for overflow. Grid10.5
places track alignment after sizing and delegates value semantics to Box
Alignment. Both observed-heading extractions succeed with zero navigation/wire
requests; all24 receipts verify, cleanup completes and source/compiled pins stay
unchanged. These Grid extracts alone do not establish the distributed fallback
mapping; the separately scoped native Box Alignment follow-up must report its
own source success or failure. Partial reader evidence is not rendering proof.

The separate nested definite percentage-row review finding remains open.
MDN's observed first click boundary is positioned Grid coordination, with
additional CSS/formatting gaps; neither is fixed or hidden by this change.
