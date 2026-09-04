# Observer callback orchestration

September 4, 2026. `ScriptDom.mutationObservers(runtime)` now supplies one native
observer binding owner for that document and callback runtime. It joins observer
registration/queues and record capabilities with two-phase callback invocation.
It is not exported into page globals: actual guest-microtask notification remains
unimplemented, so this is not a claim that pages can use MutationObserver yet.

## Native adapter API

- `create(callback)` creates an owned observer capability with observe, takeRecords
  and disconnect methods. The callback must be a function. Its receiver and second
  argument are the same observer capability; the first argument contains record
  capabilities using the existing ScriptDom node identity.
- Observe authenticates nodes through ScriptDom before reading options. Converted
  own data-property flags use boolean conversion; filters support bounded arrays
  and primitive string conversion. Accessor descriptors and object string coercion
  are rejected. General guest getters, inherited dictionary properties, arbitrary
  iterators and full Web IDL conversion remain outside this native profile.
- `hasPending()` checks both lifecycle and queue health. `checkpoint()` performs
  exactly one pending-observer notification snapshot. A runtime adapter must call
  it in a real guest notification microtask, not on arbitrary host timer turns.
- `ScriptMutationObservers` is also exported for trusted native adapters with their
  own identity/record ports and limits. These ports are capability providers, not
  untrusted deserializers. A ScriptDom owner cannot be rebound to another runtime.

No callback runs from document capture. A checkpoint takes each observer's records
and removes its transients immediately before that callback, rather than draining
all observers in advance. Callback mutations may join a later observer's current
delivery; records for an earlier observer remain pending for the next checkpoint.
Callbacks can disconnect or drain a later observer. Disconnect does not revoke
already delivered records or forget the callback needed for later reobservation.

## Callback and failure ownership

Every invocation reserves a unique admission slot before entering the record or
callback provider. Shared Promise identities cannot collapse admissions. The next
observer waits for the reported synchronous phase, not a guessed number of host
microtask turns and not the callback's arbitrary asynchronous return value. A slot
is held until both phases settle, even when the result settles first.

Ordinary callback startup exceptions and phase rejections count as failed
invocations without preventing later observers. Both rejecting phases count once
per invocation; error payloads are not retained in metrics. Native lifecycle or
resource errors at startup are fatal rather than silently dropping a delivery.
Malformed phase contracts observe obtained promises before rejecting the provider
and revoking this controller. Actual guest error-event reporting remains a runtime
integration gate; PageScripts' callback lifecycle can supply its existing diagnostics.

Defaults allow 256 lifetime observer handles, 128 simultaneously admitted callbacks
and 4,096 total callback invocations. Disconnect does not reclaim observer admission:
guest code can still keep and reuse the capability. Native queue limits and delivered
record limits remain separate. The shared SDK callback wrapper can be referenced by
other APIs, so this owner never globally releases a callback behind their backs.
Verified per-owner callback leases/guest reclamation remain outstanding.

Record-materialization failures revoke the controller and surface the error rather
than continuing after a silently truncated/dropped batch. Sparse or malformed record
arrays are rejected. Queue overflow is detected at the next checked adapter boundary;
capture still does not close the document or invoke a guest failure handler. Providers
must call the checked boundary as part of their runtime integration.

Overlapping checkpoints reject without revoking the active checkpoint. Document,
ScriptDom or explicit controller closure interrupts a pending prefix wait, releases
bookkeeping and explicit callback/capability references, and revokes future observer
methods. Late phase settlement cannot restore admission or mutate closed metrics.
The runtime owner must propagate its closure to ScriptDom/the controller; merely
changing a fake runtime's isClosed flag cannot wake an indefinitely pending Promise.

## Source inspection and scheduling gate

Read-only upstream inspection pins poe-platform/poe-code commit
`dde2f65568b41d4b53b764e9e8c42cac342549f8`, SafeJS tree
`ba2d5548765cdc69801878985a5285a0e351c43c`. The root recursive GitHub tree is
truncated and initially omits SafeJS; direct package lookup and the complete SafeJS
subtree verify its presence. No absence claim is inferred from that truncated list.

At that pin, `packages/safe-js/src/extensions.ts` exports callback phases,
invokeCallback, nestedOperation and evaluateNested but no public notification-enqueue
hook. `packages/safe-js/src/realm.ts` executes a callback prefix directly when called
from an active host phase. Calling startCallback from a mutation collector therefore
cannot be assumed to enqueue an observer notification. Internal job-queue access is
not a public contract and is not imported or patched here.

`contributions/safejs-observer-checkpoint-request.md` records the proposed public
contract and acceptance traces. It is a local draft, not a posted issue or accepted
upstream API. Issue-search requests returned HTTP 422, so duplicate-request review
is incomplete and must precede publication. No SDK artifact was installed or executed;
the approved reads fetched only source for inspection, not a replacement runtime.

## Native evidence and remaining work

The initial integration case fails on the missing ScriptDom binding. An expanded
regression exposes swallowed runtime resource-admission errors; they now revoke and
surface. A further case exposes a sparse-array validation gap; every array position
is now checked. Two parameterized filter cases initially pass an individual string
instead of the intended array; their fixture rows are corrected, not counted as
implementation failures.

There are 59 new explicit native tests, including prefix/tail ordering, shared
promises, reentrancy, record/queue/admission failures, option/identity boundaries,
closure, late settlement and a 250-callback sequence with no admission accumulation.
The focused selection passes 229 tests across five files.

Final full native validation passes 7,731 tests across 219 explicit files. The
isolated HEAD snapshot plus only this owned patch passes 4,971 tests across its
158 available native files. Production/new-test type checks, builds and four-source
Biome checks pass in both trees under Node v22.22.0. Full suites use normal file
ownership for private-file tests. Owned ScriptDom/index hunks apply independently
of pending work, and pending source/task-ledger additions and removals are preserved.

Still required: public guest-job enqueue/notification semantics, real runtime
ordering against Promise reactions, actual guest constructor/prototype behavior,
complete options/NodeList behavior, error reporting and callback/record reclamation.
No host queueMicrotask, timer, source rewrite or private runtime workaround is used
to label those gates complete. Website, socket, real TTY/PTY and SafeJS probes remain
separately authorized. Historical report paths and measurements remain unchanged.
