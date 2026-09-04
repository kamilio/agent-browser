# Owned script-node publication

Native hardening checkpoint, September 4, 2026. This strengthens the connected
ScriptDom node, Attr and NamedNodeMap paths, including newly imported nodes.

## Failures reproduced

Seven initial regressions fail before implementation. A provider could reuse a
node/attribute identity and silently rebrand an existing capability; returning
after closing the owner could repopulate caches; same-node reentry could create
competing wrappers; callbacks captured by a throwing provider could still mutate
the document. Attribute maps also lacked result, identity and late-close checks.

## Publication contract

`ScriptNodePublications` owns a synchronous publication slot until provider
construction and native registration finish. The node or attribute registry is
updated before the capability enters its owner cache. Factory exceptions,
invalid results, reused identities, failed registration and owner closure reject
without publishing or retaining a pending slot.

Property getters/setters, methods and indexed/named callbacks are guarded. They
cannot run before publication or after a failed attempt. Successful callbacks
check owner lifetime before and after their synchronous operation. Retrying a
failed node or attribute does not revive callbacks captured by the failed attempt.
These checks do not await arbitrary asynchronous tails or replace their existing
component-specific cancellation and callback ownership.

Returned object identities cannot be reused across these publication owners or
families, including after closure or failed registration. A module-owned WeakSet
does not strongly retain the objects. `NodeRelations.register` independently
rejects rebranding an existing identity to a different owner, node or Attr kind;
identical registration with the same registry remains idempotent.

This is not SDK-brand verification or a sandbox against a malicious native
provider. The provider must still construct a genuine host object from its given
definition. Other capability families, such as events, styles, collections and
Window, retain their existing owners and are not claimed hardened by this helper.

## Bounds and lifetime

- Reentry for the same kind/ID is rejected; different IDs or kinds can nest.
- At most 128 publications can be active at once, across the three kinds.
- The existing 256 attribute-map and 4,096 Attr-object limits now count pending
  reservations, preventing provider reentry from oversubscribing either quota.
- Closing the ScriptDom invalidates callbacks and clears reservations before
  dependent owner teardown. Closing/failing construction cannot repopulate caches.
- `ScriptDom.metrics().publications` exposes pending, successful and failed admitted
  publication counts plus closed state; no node IDs, attribute values or content.

Publication does not roll back native nodes allocated by create/clone/import
before the provider is called. Those remain subject to document lifetime quotas,
as documented in `DOCUMENT-IMPORT.md`. This checkpoint prevents stale or wrongly
authenticated capabilities, not guest-GC reclamation of detached native nodes.

The ownership predicate checks ScriptDom lifecycle state without reading another
DocumentTree node. Initial full-suite validation caught two extra reads in the
existing textarea-default regression. The guard was corrected, leaving that
test's exact four-read budget unchanged. This is not a runtime timing benchmark.

## Evidence

There are 40 native integration cases and 16 publication-owner cases. They cover
all callback surfaces, invalid providers, recovery, cross-owner/kind aliasing,
teardown, immutable registration, 128-level admission, full map/Attr capacity
with reentry, and 70 failed root constructions without cleanup-slot exhaustion.
An additional regression caught provider invocation after an enclosing-owner
check itself closed publication; the final guard prevents that invocation.

Focused validation passes 413 tests across eleven explicit native test files,
including import, attribute, relation, event, observer, page-binding and form-default
regressions. The existing read-budget assertion was not weakened.

Final full native validation passes 7,937 tests across 225 files. A separate
committed-HEAD snapshot plus only the owned patch passes 5,177 tests across its
164 available allowlisted files. Both trees pass production/new-test typechecks,
builds and six-file Biome checks. The earlier full runs exposed the read-budget
regression; these final runs include its fix. Pre-existing pending feature work
is preserved outside the owned patch.

## Runtime gate

Read-only inspection of the existing experimental candidate's
`/tmp/agent-browser-safejs-13.0.10/packages/safe-js/src/host-object.ts` shows its
factory validates descriptor functions/limits without invoking their callbacks
during construction. This informs the delayed-publication contract but is not
execution evidence, a released-SDK guarantee or a new performance measurement.

No SafeJS, live website, socket or real TTY/PTY probe ran. The previously denied
SafeJS fetch probe was not retried, and no corresponding report was created.
Runtime conversion, full application/site coverage and the broader seven-day
browser acceptance gates remain open. No runtime dependency or engine is replaced.
