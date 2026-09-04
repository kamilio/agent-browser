# Ordered inline declarations and native all resets

September 4, 2026. This continues `INLINE-PENDING-STATE.md` with ordinary
declaration-order retention and component-level `all` resets. The engine remains
standalone TypeScript with no new runtime dependency.

## Declaration order and ownership

Updating an unrelated property no longer changes CSSOM enumeration just because
serialization compacts separated longhands into a shorthand. The document retains
a frozen declaration projection when serializing and reparsing would change its
ordered names, values, priorities or pending origins. Already round-trippable
ordinary blocks do not consume retained-store slots. Pending groups retain their
existing admission behavior.

The existing document-owned quotas, atomic admission, owner identity checks and
close behavior also apply to order-sensitive ordinary blocks. Consequently,
removing the last pending component does not necessarily release the store if
ordinary order still needs it. This refines the earlier pending-only retention
description; it does not change the earlier measurements.

Explicit raw attribute or `cssText` replacement discards hidden ordering and
adopts the order represented by the replacement text, even when those bytes equal
the previous serialized attribute. Closing one bridge preserves the document's
styles; document close releases its retained projections.

## Native all reset profile

`all` expands into the deduplicated longhands already supported by the native
parser. The existing CSS-wide values `initial`, `inherit`, `unset` and `revert`
are accepted. Custom properties, including their importance, remain untouched.
The expanded slots participate in enumeration, per-component replacement and
removal, cascade, native geometry and software paint. A component setter replaces
its existing slot rather than being undone by a later opaque `all` declaration.

Serialization reconstructs ordinary `all` only when every supported component
has the same supported CSS-wide value and priority. Variable-containing resets
continue to use pending shorthand origins. Expanded components count toward
declaration limits before mutation; an existing background fixture's ten-slot
limit is updated to the actual reset-component count rather than weakening limits.

Command capabilities expose `document-owned-inline-declarations`,
`preservesDeclarationOrder: true` and `allReset: "supported-native-longhands"`.
These are partial native capabilities, not a full CSSOM conformance claim.

## Research and validation

Read-only primary specification research on September 4:

- `https://drafts.csswg.org/cssom/#set-a-css-declaration`
- `https://drafts.csswg.org/css-cascade-5/#all-shorthand`

The new native host-object file contains 22 cases. Against isolated prior HEAD,
16 fail and six pass. It covers ordered ordinary slots, shared owners, explicit
reset boundaries, custom-property preservation, expanded reset priorities,
component removal, layout/paint, resource preflight and capability metadata.
These fixtures do not execute SafeJS or a reference browser.

Final validation passes in both trees: focused 147 tests / five files, typecheck,
build, strict checking of both changed tests and five-file lint. Full authorized
native runs pass 9,709 tests / 271 working files and 8,563 tests / 249 isolated
files. The first full runs exposed only the background fixture's obsolete
ten-slot limit; both final full reruns pass after its component-count adjustment.
Results are also recorded in `TASKS.md` and `SEVEN-DAY-PLAN.md`.
Working-tree and isolated results are separate because unrelated pending native
test files are present only in the working tree. Historical reports remain intact.

## Open gates

Only the existing native longhand set is reset. This does not implement all CSS
property grammars, registered custom properties, direction/unicode-bidi support,
logical-property ordering, cascade-layer or `revert-layer` parity, full origin
cascade semantics, cloning parity or complete shorthand serialization. Specification
research and native fixtures are not new browser-equivalence evidence.

No live website, reference browser, socket, real TTY/PTY or SafeJS probe ran for
this checkpoint. The denied SafeJS probe remains unrun. Released-SafeJS and the
original compatibility/interaction acceptance gates remain open. The full
seven-day browser objective remains active.
