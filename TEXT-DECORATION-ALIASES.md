# Native text-decoration aliases

September 14, 2026. Four prefixed CSS names now use the existing canonical
native implementation through the shared alias map:

| Authored property | Canonical property |
| --- | --- |
| `-webkit-text-decoration` | `text-decoration` |
| `-webkit-text-decoration-line` | `text-decoration-line` |
| `-webkit-text-decoration-style` | `text-decoration-style` |
| `-webkit-text-decoration-color` | `text-decoration-color` |

The change follows aliases explicitly listed in WebKit's official
`Source/WebCore/css/CSSProperties.json`, not a claim that these names appear in
the Compatibility Standard's minimal alias table. No WebKit code, dependency,
external browser or new page runtime is imported.

## Native behavior

Stylesheets, inline declarations, CSS.supports, shorthand expansion, mixed
source order/importance, CSS-wide keywords, variables and computed reads share
canonical behavior. Inline CSSOM exposes both `WebkitTextDecoration...` and
`webkitTextDecoration...` accessors. Enumeration and serialization retain
canonical property names; aliases do not consume extra declaration slots.

The shorthand also resets the native canonical thickness component, without
adding a prefixed thickness alias or resetting underline offset. Invalid writes
remain atomic. Argument, declaration, object, source and cache limits remain
enforced, as do computed-style immutability and owner cleanup.

Real synthetic pixels and geometry verify underline, overline, strike-through,
separate prefixed longhands, supports conditions and ancestor propagation.
Generated pseudo-elements compute the aliased decoration, but **generated
decoration layout is still unsupported** and keeps the same explicit guard as
canonical decoration. Wavy/double styles and other unimplemented values remain
rejected. No other vendor properties are admitted.

## Validation

The final selected native gate passes **22,512 tests with zero failures and two
unchanged exclusions** across 446 selected files. The production build, 445 strict
test roots and scoped formatter pass. The clean manifest contains 798 entries;
352 are unselected, so this is not an all-manifest or whole-worktree claim.
Focused validation passes 428 cases, including 120 new cases: 56 parser/style/
raster and 64 fake-host CSSOM tests. No SafeJS runtime or external browser is
exercised.

The old-production baseline has 311 passes and 116 failures, all failures in
the new suites. Early focused failures exposed test assumptions about generated
decoration support and document-owned raster references; these were corrected
without changing production beyond the four aliases. A subsequent strict check
caught a test-only node/ID mismatch before native execution. All earlier round
receipts remain intact.

Evidence: `node_modules/.cache/native-validation/text-decoration-aliases-work-september14/`.
The clean candidate is derived from the preceding audited snapshot, not the
entire dirty worktree. Pre-existing changes and historical evidence are preserved.
The final `release00` audit verifies 1,352 source files, 2,176 compiled files,
unchanged old selected case names/statuses, and 106 evidence receipts.

- Audit SHA-256: `8d27acf673ab4f2d99791344257feea51af8977491eb92df526df7626d836e48`.
- Receipt ledger SHA-256: `becfff12cd81d48bd33da7fb294f1a6bae1dc5428a89df5c7a22cdd9ceff100a`.

## Remaining gates

The preceding captured MDN diagnostic identified five matched/active alias
rejections; that historical evidence is not a new validation of this runtime.
A separately pinned captured recheck is prepared but is not yet executed at this
report's creation. No new live-site, interaction, normalized speed or memory
claim follows from native tests. The overall goal remains active.

Next is a bounded font-wide inheritance implementation, with full/system font
syntax and reset-only unsupported font features explicitly out of scope until
their semantics exist. Logical spacing/units, masks, transforms, backgrounds,
the uncaptured MDN destination, broader live sites/forms, original research,
credentials/devices, SafeJS, socket, real terminal and challenge gates remain
open. Nothing pushed.
