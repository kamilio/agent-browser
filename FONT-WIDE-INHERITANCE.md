# Native font-wide inheritance

September 14, 2026. `font:inherit`, `initial`, `unset` and `revert` now expand
into the five existing native font components: font-family, font-size,
font-style, font-weight and line-height. This changes computed state and layout;
the browser does not merely ignore the declaration or suppress its diagnostic.

## Implemented behavior

- Stylesheet and inline parsing share a small font-wide helper. All five
  longhands retain source order and importance; `all` still contains the same
  real longhands, without an extra `font` component.
- Inline CSSOM exposes `style.font`, set/get/remove and complete uniform-wide
  shorthand serialization. A direct setter replaces prior component entries,
  including their importance; declaration-list priority remains authoritative.
- Existing deferred variables preserve spelling and group identity. Keyword
  fallbacks work; missing, cyclic or unsupported substituted values follow the
  native invalid-at-computed-value behavior without resurrecting older values.
- Parent/root inheritance, initial/reset behavior, button UA defaults, generated
  pseudo-elements and live ancestor/inline caches use existing computation paths.
  Unitless versus computed-length line-height remains distinct.
- Synthetic ordinary-text and rich-button cases change real height from 8 to
  48 pixels, with matching canonical-longhand pixels and expanded hit area.
  Font/control limits remain enforced; replaced controls retain their existing
  bitmap/font-size metrics rather than gaining arbitrary CSS line-height paint.

## Serialization regression caught and fixed

Source review found that admitting a deferred font after a deferred `all` could
lose the surviving non-font reset entries during `cssText` serialization. Seven
new reproductions confirmed 121 in-memory components becoming only five on
reparse. The correction emits strictly nested pending shorthand families from
broadest to narrowest before scalar overrides, preserving value and priority.
Compatibility recursion strictly decreases component count and uses the fixed
native registry; incomplete or priority-incompatible groups are not invented.

Thirteen round-trip cases cover source ordering, importance, direct setters,
earlier scalar slots, disjoint children and three-level border nesting. Source
follow-up review reports no new blocking finding within this boundary. This is
not a claim to fix generic partial-pending-removal or crossed, non-contained
pending shorthand serialization; those pre-existing limitations remain.

## Validation

Final selected gate: **22,741 passed, zero failed, two unchanged exclusions**
across 449 selected files. Production build, 448 strict roots and scoped formatter
pass. The clean manifest has 801 entries, with 352 unselected; this is not an
all-manifest or dirty-worktree acceptance claim. Focused validation passes
545 cases, including 229 new cases: 86 parser/declaration, 52 CSSOM and 91
inheritance/control/geometry tests. The old-production baseline has 349 passes
and 183 failures confined to new suites; it includes only the new unconnected
helper, not the production integration. Earlier failing development receipts
are preserved, including the actual deferred-serialization reproduction.
The first full release retains its two failures from old full-font rejection
category expectations. Those tests now expect an invalid/unimplemented value
of the recognized shorthand; their rejection and layout/raster guards remain.

The frozen candidate derives from the previous audited source rather than the
dirty worktree. Parser/declaration changes are merged independently of saved
pre-existing import reordering. Historical paths and measurements remain intact.
Evidence: `node_modules/.cache/native-validation/font-wide-work-september14/`.
The final `release01` audit verifies 1,356 source files, 2,180 compiled files,
all prior selected case names/statuses and 158 evidence receipts.

- Audit SHA-256: `22836a265c50a50744ad4d79094500cc2bef4747f4a5cf26884fcd39125e400d`.
- Receipt ledger SHA-256: `3154859a941775b3ee1d6f161dc544234289f722bc9ae5351fbcd97cc0b3ea47`.

## Deliberate limits

This is **not full CSS font-shorthand support**. Ordinary font grammar, system
fonts, unsupported font-variant/stretch and reset-only feature properties,
`revert-layer`, and full computed `font` serialization remain unsupported.
Computed longhand reads are authoritative; computed `getPropertyValue("font")`
remains empty. New modeled font state must also join future shorthand resets.
Unrelated text properties are not reset by this five-component shorthand.

A separately pinned original-MDN capture recheck is prepared, not executed at
this report's creation. Native tests alone prove no live-site, interaction,
speedup, memory or CAPTCHA outcome. Logical spacing/units, other sampled layout
features, the uncaptured MDN destination, broader live sites/forms, original
research, credentials/devices, SafeJS, socket and real terminal gates remain
open. Overall goal active; nothing pushed.
