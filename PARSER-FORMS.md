# Native parser-created form associations

Checkpoint: September 4, 2026. Native TypeScript implementation only.

## Reference and supported behavior

Reviewed the WHATWG HTML standard, last updated September 3, 2026:
`https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#association-of-controls-and-forms`
and the form-associated insertion/removal steps in
`https://html.spec.whatwg.org/multipage/infrastructure.html`.

The parser can now associate a supported control with its form-element pointer
even when table recovery makes that form a non-ancestor. The shared supported
tag classification covers button, fieldset, input, object, output, select and
textarea. An explicit form attribute takes precedence; template contents never
inherit the outer parser pointer.

`DocumentTree.insertParserElement` prepares the association before insertion.
It accepts an unattached native element and a form in the same document owner,
and associates only when the intended parent and form share a tree root. Foreign
identities and invalid insertion candidates are rejected. A failed insertion
clears the prepared override; this is not a promise to undo arbitrary mutations
performed by native callbacks.

## Shared consumers and reset rules

Native form-owner lookup, form control collections, submission preparation,
reset actions and host form bindings use the same override. Radio grouping also
consults it before selecting a peer, so radios from different parser forms do
not accidentally become a single ownerless group. An association revision
invalidates control indexes even before the ordinary insertion revision changes.

Setting a form attribute through either attribute API resets the override.
Removing or moving a control/subtree resets overrides whose form lies outside
that removed subtree. Associations survive when the moved subtree contains both
the form and control. Detaching only a non-ancestor form does not itself reset
the external control; a subsequent control removal does. Fragment transfers reset
the affected top-level associations, while clone/import does not copy parser
overrides into new nodes.

Tests cover native insertion notification and reparenting during that notification.
These cases do not establish complete synchronous collector observability for
all native radio state changes or arbitrary reentrant DOM operations.

## Bounds and lifecycle

Association storage has at most one entry per allocated native element and uses
native numeric identities, not references into another document owner. Removal
checks visit the moved subtree and use a temporary identity set bounded by the
native node limit; empty association storage skips that work. Existing native
node/text/depth limits and parser work limits remain in force.

Closing a candidate releases its association map. Failed script hooks,
cancellation after parser writes, failed native insertion validation and failed
form-attribute quota checks retain explicit cleanup/failure behavior. These are
structural and operation-bound tests, not runtime/RSS measurements.

## Remaining work and gates

Historical image associations and form-associated custom elements are not added.
The existing unsupported form features, fragment mode inheritance, provisional
scaffold publication timing, full EOF diagnostics, modern select behavior and
cross-owner observer/runtime integration remain open. This checkpoint does not
claim full HTML form or framework conformance.

Submission tests prepare native requests without sending them. Host-binding
tests use native factories, not a page runtime. No SafeJS, live website, socket
or real TTY/PTY probe ran. The previously denied SafeJS probe remains unrun and
the independent acceptance gates remain open.

## Validation

Three initial association/collection/radio regressions fail before integration.
The final 40 new tests pass, with 293 focused checks across ten files, including
existing radio-cache work checks and form-default behavior. Tests cover the
supported tags, explicit attributes, shared submission/reset/bindings, movement,
fragment transfer, clone/import, templates, native callbacks, ownership rejection,
quota failures and candidate cleanup.

Full native validation passes 8,609 tests across 239 files. An isolated archived-
HEAD tree with only this checkpoint's changes passes 5,849 tests across its 178
available files. Production and new-test type checks, builds and six-file lint
pass in both trees. Existing uncommitted work is excluded from the isolated patch
and from this checkpoint's commit; these native results do not close any of the
independent acceptance gates.
