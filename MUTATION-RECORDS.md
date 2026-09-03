# Native mutation record capture

September 3, 2026 continuation of the JavaScript-application work in
`SEVEN-DAY-PLAN.md`.

## Why this layer is needed

The existing presentation change log contains revision, kind and target. It does
not preserve attribute names, old strings, removed nodes' original parents or
logical sibling positions. Reconstructing MutationObserver records from that log
after mutations would lose information. This checkpoint captures records at the
shared document mutation methods instead. It does **not** expose or claim a
working page `MutationObserver` constructor.

## Native contract

`DocumentTree.onMutation(collector)` registers a synchronous native capture hook
and returns an idempotent unsubscribe function. `DocumentMutation` is exported
alongside the existing document types. Records contain type, target node ID,
inclusive ancestor IDs, added/removed node IDs, sibling IDs, attribute name,
null attribute namespace and old string value. Inapplicable fields are null or
empty. Records and all lists are frozen snapshots; IDs are not guest capabilities.

Collectors must only copy, filter or enqueue records. They must not mutate or
close the document, invoke guest callbacks, or reenter mutation methods during
capture. This is an internal observer-registration seam, not callback delivery.
Collector exceptions are counted without retaining their payloads or interrupting
the mutation and other collectors. Unsubscribed collectors are skipped.

There are at most 32 distinct native collectors. The document keeps no mutation
record history or delivery queue. Full record/list allocation is skipped without
collectors. Existing document node, depth and text limits bound individual record
payloads; native consumers are responsible for any retained copies. Future guest
observer queues still require their own admission and retention budgets.
`mutationMetrics()` reports registrations, notifications, collector failures and
closure, without content or error messages. Closure drops collector references.

## Captured operations

- Attribute set/remove/toggle and attached Attr operations preserve old strings,
  including same-value sets. Missing removals, reattaching the identical Attr and
  writes to detached Attr nodes do not fabricate element changes.
- Text/comment writes and replaceData preserve old data, including same-data
  writes without inventing a presentation revision.
- Insertions and moves capture original removal and new insertion positions.
  Inserting a node before itself records the logical remove/insert operation
  while retaining the existing no-op view identity and presentation revision.
  Fragment draining records one fragment removal and one destination addition.
- Replacement, replacement-all and textContent aggregate destination changes.
  Replacing all with an existing child retains the complete old child list;
  replacement's previous-sibling snapshot is taken before moving that sibling.
- splitText emits the insertion before the original character-data record, without
  exposing initialization of the new text node as a data mutation.
- normalize preflights retained text growth, plans changes in depth-first order,
  rebuilds parent child lists in linear passes, and reports each logical removal
  with its original sibling boundaries. Nonempty singleton text nodes still
  produce the required character-data record. Detached text identity is preserved.
- Page-facing mutations and parsed HTML use the same methods. Clone/import
  construction and initial attributes do not produce spurious mutation records.
  Control current values, location and presentation invalidations are not DOM
  attribute/child/data mutations. Failed quota and hierarchy checks publish none.

## Evidence and remaining work

Reviewed DOM mutation-record, replacement, attribute, character-data, split and
normalization algorithms at `https://dom.spec.whatwg.org/` on September 3, 2026.
Three baseline tests fail with the missing capture hook. Later replacement-edge
tests reproduce two incorrect record shapes; both are fixed. This is source and
native-fixture evidence, not execution of another browser or a WPT parity score.

The explicit native allowlist gains 50 tests. Coverage includes operation grouping,
ancestry snapshots, immutable lists, cached views, script/HTML integration,
quotas, collector admission/errors/cleanup and a 4,000-text-node normalization
case. Focused checks pass 261 tests across nine files. The first broad and isolated
runs both expose an existing view-identity expectation for self-insertion; capture
is decoupled from that no-op optimization, with a dedicated new regression.

Final working-tree validation passes 7,549 native tests across 216 explicit files.
The isolated HEAD snapshot plus only the owned patch passes 4,789 tests across
155 available native files, excluding pre-existing pending work. Three patch
contexts touched the pending pointer/activation changes; only the new mutation
hunks were transplanted, and the remaining document diff matches the original
pending additions/removals. Production/new-test type checks, build and three-source
Biome checks pass under Node v22.22.0. Full suites use normal file ownership.

Next: native observer registrations and option validation, subtree/attribute
filtering, transient detached-subtree tracking, bounded per-observer queues,
takeRecords/disconnect, and runtime-correct asynchronous delivery. Only then expose
page MutationObserver capabilities and validate framework behavior. Full namespace,
shadow-tree/custom-element/live-range semantics and arbitrary host reentrancy
remain open. Website, socket, real TTY/PTY and SafeJS gates remain separately
authorized; no such probe was run for this checkpoint. Historical reports stay
unchanged.
