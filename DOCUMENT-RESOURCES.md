# Shared document resources

September 4, 2026 continuation of `DOCUMENT-TYPES.md` and the seven-day plan.
This is the native resource-owner prerequisite for bounded auxiliary documents;
it does not yet expose `document.implementation.createHTMLDocument`.

## Contract

`DocumentResources` in `src/document-resources.ts` owns an optional shared budget.
Pass it as the third `DocumentTree` constructor argument. Existing two-argument
construction remains independent; it does not acquire a process-wide budget.
Registration is a constructor protocol, not a way to retrofit limits onto an
already-created independent tree.

- At most 16 simultaneously retained documents share a pool. The configurable
  count can be lower, not higher. Document roots count toward the node budget.
- Defaults are 50,000 nodes and 2,000,000 UTF-16 code units across the pool, not
  per additional document. Per-document limits still apply independently.
- Nodes include native Attr records and detached nodes. Text accounting reuses
  the existing document ledger: text/comment data, element names, attributes and
  retained Attr copies, control values, custom validity, and doctype identifiers.
  Detaching a subtree does not release its retained allocations.
- Text shrinking releases the corresponding text capacity. Closing a document
  releases its membership and all retained node/text capacity. Replacing closed
  documents is allowed; this is not a lifetime creation-attempt/churn limit.
- `resourceUsage()` and pool `metrics()` return frozen, content-free counts.
  Quota checks read counters from at most 16 owners, never traverse their DOMs.
  No exact RSS, layout-cache or runtime-heap ceiling is claimed.

The pool does not allocate native Attr records or traverse live collections just
to measure usage. Unpooled operations add no shared-owner counter reads.

## Failure and teardown

Allocation and text mutation check both local and aggregate limits. Copy/import
preflights the complete retained source payload before allocating its first
copy. Same-pool copies are charged in addition to their retained source; copies
survive source closure while the destination remains open.

A failed root allocation removes its temporary membership. Closing a pool first
rejects new admission/allocation, then attempts every document's teardown, even
if multiple native close handlers throw. Cleanup failures are aggregated only
after all documents have been attempted. Repeated closure is harmless. Existing
tree-close hooks revoke associated ScriptDom and implementation capabilities.

Native synchronous change callbacks can consume capacity during a multi-node
copy. Each later payload is checked again so it cannot overcommit the aggregate
budget. Such reentrant failure may leave already-created detached copies charged
to the destination; it is not a rollback transaction. Ordinary quota failure in
the initial complete-copy preflight allocates nothing.

## Validation

Four initial regressions failed before DocumentTree integration. Forty-five new
allowlisted native cases cover accounting, limits, constructor failure, mutations,
attributes, control/validity data, doctypes, copying, reentrant allocation and
cleanup, pool isolation, and ScriptDom capability revocation. Focused validation
passes 297 tests across nine explicit files.

Full native validation passes 8,022 tests across 227 files. A separate snapshot of
committed HEAD plus only this patch passes 5,262 tests across its 166 available
allowlisted files. Production/new-test types, builds and three-file Biome checks
pass in both trees. Pre-existing pending work remains outside this checkpoint;
historical reports and measurements are unchanged.

## Next integration and gates

Wire one pool through a bounded auxiliary-document family, including nested
creation. Add separate cumulative creation admission, inherited origin metadata,
inert document defaults, correct ownership, and root-runtime teardown before
publishing `createHTMLDocument`. Parsed DOCTYPE handling and real template content
ownership remain separate unfinished steps; do not remove parser rejection to
pretend those behaviors exist.

No SafeJS, website, socket or real TTY/PTY probe ran. The previously denied SafeJS
probe remains unrun. Native tests do not close those gates or the seven-day goal.

## Research

Reviewed the current [DOMImplementation creation contract](https://dom.spec.whatwg.org/#interface-domimplementation)
on September 4, 2026. Shared resource limits are an explicit native-engine policy,
not a claim that the DOM standard specifies these limits or that this checkpoint
implements the document-creation algorithm.
