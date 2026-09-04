# Native document observer ownership

`src/document-observers.ts` adds a native registration and queue owner on top of
`DocumentTree.onMutation`. It does not expose a page `MutationObserver` constructor,
execute callbacks or claim asynchronous runtime integration. No dependency or
alternative browser engine is added.

## Native API

- Construct `DocumentObservers(tree, limits?)`; one mutation subscription and one
  cleanup subscription serve all its observer handles. Failed cleanup-subscription
  admission releases the capture subscription.
- `create()` returns an owner-local, monotonically allocated numeric handle.
  `observe(handle, targetId, options)` validates an existing document node and
  updates or adds registrations. These are trusted native IDs, not authenticated
  guest capabilities; the future bridge must enforce document/owner identity.
- `takeRecords(handle)` transfers a frozen record array and empties that queue,
  without clearing pending notification or transient registrations.
- `disconnect(handle)` drops registrations and queued payloads. The handle can be
  observed again. `release(handle)` additionally frees handle admission capacity;
  released IDs are never reused within the owner.
- `close()` is idempotent, releases subscriptions, drops the document reference,
  registrations, queues and delivery state. Document closure also closes the owner.
  `metrics()` remains readable, frozen and content-free.

Options are already-converted native booleans and arrays of strings, not general
Web IDL coercion. Attribute old-value/filter presence enables attributes when its
flag is omitted; character-data old-value presence similarly enables that type.
Explicit false old-value options still count as present. Inconsistent flags throw
TypeError before registration changes. Filters are copied, exact/case-sensitive,
and empty filters match nothing. Unknown extra native dictionary members are not
used. Guest getters, iterators and conversions require a separate runtime bridge.

Matching walks captured inclusive ancestors in order. Subtree/type/filter checks
select registrations; overlapping matches queue one record per observer, with old
values retained if any matching registration requested them. Nonmatching options
cannot expose old values. Records omit capture-only ancestry, retain immutable
node-ID lists/sibling boundaries and preserve per-observer identity and ordering.

Removal records create transient registrations even for observers not requesting
child-list records. Nested removals preserve exact source-registration identities.
Reobservation removes transients sourced from the updated registration; notification
and disconnect remove that observer's transients. Removal alone need not make an
attribute-only observer pending; a later matching mutation does. Explicit detached
registrations remain after transient cleanup. This builds on the capture layer's
non-reentrant native mutation profile, not full custom-element/shadow-tree behavior.

## Delivery protocol, not a scheduler

`hasPending()` reports observers awaiting a notification checkpoint.
`beginDelivery()` snapshots their insertion order and clears the pending set;
it returns false when empty and rejects overlapping active checkpoints.
Repeated `nextDelivery()` calls transfer one nonempty observer queue at a time,
clearing that observer's transients immediately before its delivery. Call until
null to finish the checkpoint, even after the last nonempty result.

This per-observer transfer matters: a mutation between deliveries can still join
a later observer's current delivery, whereas records for an already-delivered or
newly pending observer remain for a later checkpoint. Empty/drained/disconnected
observers are skipped, but their transient cleanup still occurs. Release and close
cannot revive stale IDs already captured in the notification set.

The owner never calls guest code from synchronous document capture and never uses
host promises or a guessed number of microtask turns. A future runtime adapter must
schedule the actual guest microtask, wait for each callback's synchronous phase
before advancing, report callback errors, and coordinate callback-result ownership.
It must not await arbitrary returned guest promises to order observer callbacks.
Cross-document agent ordering, slot changes and guest record/NodeList wrappers are
not implemented by this native owner.

## Bounds and failure

All configurable limits must be positive safe integers. Defaults:

| Limit | Default |
| --- | ---: |
| Observer handles | 256 |
| Registrations, including transients | 2,048 |
| Queued records per observer | 1,024 |
| Queued records across the owner | 4,096 |
| Retained record string code units | 2,000,000 |
| Retained record node-ID references | 65,536 |
| Filter input names per registration | 128 |
| Filter input string code units per registration | 4,096 |

Record string accounting includes attribute names and requested old values. Node-ID
accounting includes targets, added/removed lists and non-null sibling IDs. Shared
payloads are conservatively charged per queued record. Duplicate input filter names
still count toward input bounds. Registration limits also bound retained option
snapshots; transient source IDs do not retain an unbounded chain of old objects.
Dequeuing, disconnecting and delivery return queue budgets. Records transferred to
native consumers are no longer owned here: downstream/guest retention needs its
own admission and lifetime budget, not a claim of globally bounded output memory.

Explicit create/observe admission failures are atomic and leave the owner healthy.
Capture-time queue or transient overflow instead poisons the whole owner, clears
all retained state and unsubscribes without throwing into the document mutation.
Partial fanout is never returned as a successful truncated queue. Every operational
API, including `hasPending()` and `assertHealthy()`, subsequently throws a generic
`resource-limit`; metrics expose only the failure flag and counts. `close()` remains
available. The DOM write completes normally and other native collectors continue.
The future adapter must call `assertHealthy()` at its mutation/runtime boundaries;
ignoring that check would hide an observer failure. There is no automatic recovery
that silently resumes after lost records.

## Validation and remaining gates

The DOM Standard observer options, record matching, removal/transient sources and
notification algorithms were reviewed at `https://dom.spec.whatwg.org/`. This is
source review, not WPT execution or another browser's measured behavior.

The initial new test file fails to import the missing implementation. The expanded
suite catches an incorrect test call to native `replaceChildren` (an optional node
ID, not an array); correcting the fixture also resolves its test type error.
There are 73 new explicit native tests. Focused checks pass 172 tests across four
files, including the existing capture, cached-view and script-mutation regressions.

Final full native validation passes 7,622 tests across 217 explicit files. The
isolated HEAD snapshot plus only this owned patch passes 4,862 tests across its
156 available native files, without pending features. Production/new-test type
checks and builds pass in both trees; three-source Biome checks pass under Node
v22.22.0. Full suites run with normal file ownership for private-file tests.
The existing pending index and task-ledger changes remain outside this commit.

Page construction, callback capabilities, safe guest option conversion, actual
runtime microtask ordering, retained guest record budgets and framework behavior
remain next. Namespace support and the source capture layer's reentrancy limitations
remain explicit. Live website, socket, real TTY/PTY and SafeJS gates still require
separate authorization; this checkpoint runs none of those probes. Historical
reports and their original measurements remain unchanged.
