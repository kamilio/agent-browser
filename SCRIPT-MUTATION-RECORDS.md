# Bounded mutation record capabilities

`ScriptDom.mutationRecords(records)` connects drained native observer records to
the existing document's node capabilities. `ScriptMutationRecords` is also exported
for native adapters needing explicit retention limits and metrics. This is the
record-materialization dependency for page observers, not an installed guest
`MutationObserver` constructor or a delivery scheduler.

## Record and node identity

The returned frozen native array contains distinct host-object record capabilities.
Read-only properties expose type, old value, attribute name/namespace, target,
previous/next siblings and added/removed node lists. Target and sibling IDs resolve
through the same `ScriptDom.node` cache used by other DOM operations; detached nodes
keep their document identity. Capture-only ancestry and numeric IDs are not exposed
as guest record fields. Each input record gets a distinct capability, even when the
same native record is materialized again.

Added/removed lists are static snapshots, lazily materialized once per record and
property. They provide indexed access, read-only length and `item(index)`, preserving
node identity without becoming live child collections. Missing indexed entries are
undefined; out-of-range item results are null. Primitive index conversion follows
unsigned-long wrapping; missing arguments, object/function coercion, BigInt and
Symbol are rejected. Index strings are bounded to 4,096 code units. This is not
complete Web IDL conversion, NodeList iteration or forEach support. The current
host-object contract has no general Symbol.iterator facility; those capabilities
remain part of the runtime/collection integration work.

The native input is a typed record sequence, not a guest dictionary or arbitrary
object deserializer. Every referenced node must exist in this document before
materialization; foreign/stale IDs in any record or list fail before allocation.
Fields and node lists are copied before entering the capability provider. Later
native input mutation cannot rewrite a delivered record or bypass its budget.

## Ownership and admission

Defaults bound the owner's lifetime output to 1,024 records, 2,000,000 retained
record string code units and 65,536 node-ID references. Limits must be positive safe
integers. String accounting includes requested old strings and attribute names;
node accounting includes targets, lists and non-null siblings. A record uses one
host capability and at most two lazy list capabilities, so these outputs cannot
grow without the record budget. Node capabilities remain separately owned and
bounded by the existing document/runtime machinery.

All batch quotas and node IDs are checked before any capability is created. The
whole batch reserves admission and snapshots every member before the first provider
call, preventing a reentrant provider from oversubscribing limits or mutating a
later record into an unbudgeted payload. Explicit preflight failures are atomic and
leave earlier records usable. Downstream adapters must surface the error; wrapping
a drained native queue does not silently restore or truncate that queue.

Issued record budgets deliberately do not reset after callback completion,
takeRecords, disconnect or native queue drainage: guest code may retain a record
or just its node list. The current factory contract does not provide safe guest-GC
notifications or per-host-object release. Reclaiming these budgets on callback
return would permit unbounded retained records. A real runtime adapter must honor
these lifetime limits or introduce a verified ownership/reclamation contract,
not claim that the native queue limits already cover delivered guest records.

Capability-provider failure, duplicate/invalid capability identity, recursive list
construction and node-provider failure revoke this record owner. Reentrant closure
is checked after both capability and node provider calls; a closed owner cannot
publish a late result. Closure nulls all record payloads and provider/document
references, drops cached lists and metrics, and unregisters its document hook.
Previously returned records and lists reject subsequent access. ScriptDom and
document closure both revoke integrated records. Ordinary item argument errors do
not revoke an otherwise healthy owner.

## Evidence and remaining integration

The DOM Standard record and NodeList interfaces were reviewed at
`https://dom.spec.whatwg.org/`. Read-only inspection of the repository's
`PageRuntime`, `PageBindingContext` and released-extension adapter types finds
callback synchronous/result phases but no guest-microtask scheduling hook in that
local contract. This does not establish the absence of a feature from every
upstream release. No SDK installation, alternate artifact acquisition or runtime
probe was used to fill that evidence gap.

The initial integration regression fails because ScriptDom cannot materialize
records. Expanded tests reproduce a factory-reentrancy budget bypass: a provider
can replace a later record's old value after admission but before its snapshot.
Whole-batch snapshots fix it. Three additional regressions reproduce late node
publication after closure, missing revocation after resolver failure and primitive
resolver results; all are fixed. There are 50 new explicit native tests, and the
focused selection passes 193 tests across four files.

Full native validation passes 7,672 tests across 218 explicit files. The isolated
HEAD snapshot plus only this owned patch passes 4,912 tests across its 157 available
native files. Production/new-test type checks, builds and four-source Biome checks
pass in both trees under Node v22.22.0. Full suites use normal file ownership for
private-file tests. One ScriptDom patch context overlaps a pending hit-testing
field; only the new record-owner field is transplanted into the isolated snapshot.
Existing pending source and task-ledger additions/removals are preserved.

Next: observer construction and callback capabilities, runtime-owned microtask
notification, actual synchronous-prefix ordering and callback error handling,
safe guest option conversion, NodeList iteration and verified guest retention.
The current record helper must not be mistaken for functioning page callbacks.
No host-Promise scheduling substitute is introduced. Full observer/framework,
released SafeJS, real-site, socket and real TTY/PTY gates remain open and separately
authorized. Historical reports and their original measurements are unchanged.
