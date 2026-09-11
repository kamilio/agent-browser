# Positioned boxes and computed float

Native `DocumentStyles` computes `float:none` for a generated box whose computed
position is `absolute` or `fixed`. This cross-property adjustment happens before
descendants inherit flow values and before formatting assigns the box to the
existing positioned-layout coordinator. It prevents a specified float from
incorrectly introducing an independent float-layout blocker on a positioned box.

The bounded native CSS 2.2 §9.7 extraction in `FLOAT-FORMATTING-SOURCE.md`
establishes this precedence. It also establishes that `display:none` produces no
box before positioning/float rules apply. The native engine's existing
`display:contents` non-box behavior is preserved, not extended into a claim of
complete modern display conformance.

## Observable behavior

- Inline declarations, including `cssFloat`, declaration order and `!important`,
  keep the authored value. Resolved/computed float is `none` on generated
  absolute/fixed boxes; no DOM style attribute is rewritten.
- Explicit `float:inherit` reads the parent's computed value. Explicit position
  inheritance, cascade changes and DOM mutations recompute the adjustment.
  Previously returned frozen computed-style snapshots remain unchanged.
- Existing positioned display adjustment, containing blocks, dimensions,
  stacking, raster output, hit ownership and fixed viewport anchoring remain
  coordinated by the native positioning implementation.
- Removing absolute/fixed positioning restores the authored real float and its
  existing unsupported-layout gate. A genuine unrelated float, overflow issue,
  or other unsupported formatting feature is not suppressed.
- Float/clear capability flags remain conservative. This is **not general float
  layout**, line wrapping around floats, float shrink-to-fit sizing, clearance,
  overflow clipping, scrolling-container support, or a CAPTCHA workaround.

## Validation scope

`src/positioned-float-computation.test.ts` covers computation/cascade/inheritance,
specified values, mutations, non-box cases, frozen snapshots and native owner
closure. `src/positioned-float-integration.test.ts` covers actual layout, raster,
hit testing, fixed scrolling, stacking, restored guards and one genuine native
checkbox pointer activation using an in-memory transport.

That checkbox action fails the width-profile guard on unchanged prior production
and passes with this computation fix. Native tests do not establish live website,
socket, credential-provider, device/TTY or real SafeJS acceptance. In particular,
the real static float and overflow blockers retained in
`OPENBSD-FONT-WEIGHT-FLOW.md` still require substantive layout implementation.
