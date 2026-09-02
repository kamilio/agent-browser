# Modern DOM insertion and replacement

September 2, 2026. Page scripts can use ParentNode and ChildNode mutation methods
on the independent native document. This adds real mutation behavior, not source
rewriting, a remote browser, or methods that only satisfy feature detection.
No dependency or runtime switch is required.

## Supported operations

- Document, DocumentFragment and Element: `append`, `prepend`, `replaceChildren`.
- Element, Text and Comment: `before`, `after`, `replaceWith`, `remove`.
- Node: `replaceChild(newChild, oldChild)`, alongside the existing `appendChild`,
  `insertBefore` and `removeChild`. Invalid parent kinds still reject insertion.
- Primitive arguments become separate text nodes, without parsing HTML or merging
  adjacent strings. Null and undefined stringify. Owned node arguments retain
  identity, listeners, native controls and element references; they are moved,
  not cloned. `replaceChild` returns the old node; variadic methods return undefined.
- Fragments transfer their children in order and become empty. Duplicate node
  arguments end up at their last argument position. Sibling operations account
  for moving their own target and neighboring siblings in the same invocation.
- Empty append/prepend/before/after calls do nothing. Empty `replaceWith` removes
  its target; empty `replaceChildren` clears the parent. Detached ChildNode calls
  validate supplied values but neither allocate text nor move the supplied nodes.
- Document replacement excludes the removed root(s) when validating incoming
  children. It still rejects text children, multiple elements, cycles and invalid
  references. Replacement of an ordinary child can promote one of its descendants.
- Tree replacement validates depth/cycles/references before detaching the old
  contents. Bulk clearing uses one child-list pass, not repeated array splicing.
  Existing native selection updates apply; moving options through a fragment can
  trigger fallback selection in their former select. There is no stale-value restore.

`capabilities.domMutations` advertises this partial profile and its argument limit,
with explicit false values for object coercion, cross-document adoption and observers.

## Failure, resource and ownership boundaries

Each variadic call accepts at most 1,024 arguments. Node, text and depth quotas
apply to both connected and detached nodes. Unknown objects, foreign node
capabilities, functions and symbols are rejected without invoking coercion hooks.
All calls recheck the owning document, including zero-argument/no-op operations.

The conversion stage follows the node/string-to-fragment ordering model. Multiple
node arguments can be detached into a temporary fragment before a later invalid
hierarchy is discovered. Such calls are **not transactional**; no rollback is
fabricated. A single incoming fragment rejected by final hierarchy/depth validation
is not consumed, and old replacement contents stay attached until validation passes.
Text allocation failures can consume some native allocation budget even when no
existing child is detached.

Temporary fragments and allocated text remain charged to this document's bounded
node store until document closure. This is not a garbage-collected DOM. Native
subtree validation is bounded by argument/tree limits, not precisely charged as
interpreter instructions. Hard containment still requires the existing owned
process boundary; this patch does not claim constant-time mutation or production
performance across large framework trees.

## Evidence

- `reports/script-mutations-focused-2026-09-02.json`: 1,395 tests across 64 files.
  Includes 32 mutation cases, one of which checks 726 repeated/overlapping argument
  combinations against an independent marker-list model. Other cases cover
  fragments, detached nodes, document roots, character data, returned identity,
  control state, references, quotas, closure and pre-mutation validation.
- `reports/script-mutations-safejs-fixture-2026-09-02.json`: 12 checks through the
  actual existing experimental SafeJS interpreter. Native fill/click drives an
  interpreted task-list UI; moved/replaced buttons keep listeners, semantic
  snapshots reflect changes, and fragment/sibling/text operations modify the
  same native document. Script-owner cleanup leaves borrowed native state usable.
- `reports/script-mutations-script-select-regression-2026-09-02.json` (11),
  `reports/script-mutations-selection-state-regression-2026-09-02.json` (10) and
  `reports/script-mutations-action-wait-regression-2026-09-02.json` (8) add 29
  passing existing-core regression checks for selection, native forms and waiting.

These are in-memory fixtures, not live websites, a real terminal, a published SDK
gate, full framework compatibility or a web-platform-test conformance score.
The opt-in JavaScript policy and released-adapter acceptance gates are unchanged.

## Remaining compatibility work

Full WebIDL coercion and exception types, cross-document adoption/import, doctypes,
namespaces, shadow trees, custom-element reactions, MutationObserver delivery,
live NodeList semantics and dynamically inserted script execution remain open.
The newer `moveBefore` state-preserving operation is not implemented. Ordinary
movement here is not a promise to preserve focus, animation or embedded-frame state.
The later `HTML-INSERTION.md` checkpoint implements contextual outerHTML
replacement and insertAdjacentHTML, with a separate bounded staging/commit path.

Primary algorithms inspected for this implementation:

- https://dom.spec.whatwg.org/#concept-node-replace
- https://dom.spec.whatwg.org/#interface-parentnode
- https://dom.spec.whatwg.org/#interface-childnode
- https://html.spec.whatwg.org/multipage/form-elements.html#the-select-element
