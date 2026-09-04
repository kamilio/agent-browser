# Native named disclosure groups

September 4, 2026 continuation of `DETAILS-CORE.md`, `DETAILS-TOGGLE.md` and
`SEVEN-DAY-PLAN.md`.

## Exclusivity rules

Details with the same nonempty `name` in the same native tree now form an
exclusive group. Names match exactly, without trimming or case folding; empty
and missing names do not group. Native maps handle names such as `__proto__`
without object-key collisions. Other elements with a `name` do not participate.

Adding `open` closes the previously open member. Changing an open element's
name to join an occupied group instead closes the joining element. Inserting an
already-open member, including through a wrapper or fragment, also closes the
incoming member rather than stealing the existing selection. Parser insertion
keeps the first open member regardless of attribute order. Value-only writes to
an existing `open` attribute do not create new toggle tasks.

The same rules apply within detached roots and template-content trees without
mixing them with the connected document. Removal/moving, replacement, HTML
replacement, clone and import paths retain current root membership. Replacement
preflight excludes nodes that are being removed, so a removed member cannot
close its own replacement. Nested same-name markup still receives enforcement;
support for this behavior is not a recommendation to author nested groups.

Details now expose a `name` property through the existing string-attribute
reflection/conversion and binding-revocation paths. Group closure updates the
real `open` attribute, attached attribute records, focus, layout and expanded
snapshot state, not a separate selection flag.

## Ownership, notifications and bounds

`DocumentDetailsGroups` belongs to the existing document. It indexes only open,
nonempty-named details, with names and node IDs rather than copied subtrees.
Ancestry follows the authoritative nodes, so moving a subtree cannot leave a
stale cached root. Insertion inspects the moved subtree and matching open group
members rather than repeatedly querying all document nodes. Existing document
node/depth/text limits and disclosure task lifetime limits bound retained state
and candidate work. No runtime dependency or independent browser engine is added.

Automatic closures use the existing document attribute-removal path. Opening a
member queues its toggle before the old member's closing toggle. Related native
mutation records retain their order while collection waits until the group
reaction completes; reentrant mutation collectors see exclusive state. The
opener's cached view is invalidated before change handlers can inspect the closed
peer, including attribute-node writes.

Notification preflight covers both transitions together. It counts replaceable
queued tasks correctly, allows valid coalescing at concurrent capacity, and
requires lifetime capacity for every new task. Insertion, replacement and rename
check required automatic closures before changing topology or attributes. Native
tests verify rejected operations preserve the previous group state, revision,
attribute ownership and relevant child/parent relationships. This is not a claim
that arbitrary native change-handler side effects form a rollback transaction.

## Native evidence

The 50-case new file produces 44 failures and six passes on isolated prior HEAD.
Two additional change-observer regressions fail after initial group wiring and
pass after the opener-view invalidation fix. Focused runs pass 323 tests / seven
files in both working and isolated trees. Both pass types/builds, strict checking
of the new file and five-file Biome checking. `native-tests.json` explicitly
includes the new file.

Authorized full native runs pass 10,258 tests / 281 working files and 9,112 /
259 isolated files. The isolated tree contains only this checkpoint over prior
HEAD, keeping unrelated pending changes out of the proposed-commit evidence.

Read-only primary research on September 4 used the HTML interactive-element
rules, DOM insertion rules and upstream details name-attribute test source:

- `https://html.spec.whatwg.org/multipage/interactive-elements.html`
- `https://dom.spec.whatwg.org/`
- `https://raw.githubusercontent.com/web-platform-tests/wpt/master/html/semantics/interactive-elements/the-details-element/name-attribute.html`

The native cases exercise this repository's implementation. Reading upstream
test source is not running WPT or validating against a reference browser.

## Remaining acceptance gates

Continue with generated disclosure summaries/markers and remaining event
interfaces. Full UA/shadow/accessibility behavior, ToggleEvent constructor/
prototype/handler/trust semantics, task-source ordering and released-runtime/
browser parity remain open. No live-site, socket, real TTY/PTY or SafeJS probe
ran; the denied SafeJS probe remains unrun. Historical evidence and unrelated
pending work stay separate. The complete seven-day browser objective stays active.
