# Draft: public guest-job notification checkpoints for browser observers

Status: local proposal only, September 4, 2026. Do not treat this file as a posted
issue or an existing API. Upstream issue-search queries returned HTTP 422; check for
duplicates and obtain publication approval before submitting.

## Verified context

The native TypeScript browser can capture DOM mutations, filter registrations and
transients, bound queues/retained record capabilities, and invoke observers through
separate callback synchronous/result phases. The missing integration is a public
runtime-owned notification enqueue operation with ordering relative to guest jobs.

Source inspection at poe-platform/poe-code
`dde2f65568b41d4b53b764e9e8c42cac342549f8`:

- `packages/safe-js/src/extensions.ts` defines the public ExtensionContext, including
  startCallback, invokeCallback, nestedOperation and evaluateNested. It has no
  public enqueue operation for a host-owned observer notification job.
- `packages/safe-js/src/realm.ts` uses runAsyncPrefix for callbacks started inside an
  active host phase; startCallback is not unconditionally a deferred notification.
- The realm's internal SandboxJobQueue is not a supported public capability. A host
  queueMicrotask does not establish guest-job ordering across interpreter yields.

This is source/API evidence, not execution of the installed/released artifact.
The browser has not imported internal job state, rewritten guest source, installed
an alternate artifact or approximated a guest checkpoint with host timer turns.

## Requested capability or supported alternative

Please provide guidance or an explicit public extension capability that can:

1. Enqueue one host-owned notification at the current position in the guest
   microtask/job ordering, without executing it inline in a mutating host method.
2. Keep the notification job active while the browser invokes all selected observer
   callbacks in order, waiting for each reported synchronous prefix but not an
   arbitrary async callback tail. Guest reactions queued by a callback must not run
   between observers belonging to that same notification job.
3. Permit mutations in a callback to enqueue a later notification, with ordinary
   FIFO ordering relative to guest Promise reactions already queued at that point.
4. Support native DOM changes made while the realm is idle, without inventing an
   extra source evaluation or requiring private queue/AsyncLocalStorage access.
5. Bound queued notifications/work and retained callback roots, propagate cancellation
   and realm failure, and release queued work on cleanup without late execution.
6. Preserve existing callback argument/receiver capabilities, diagnostic behavior and
   synchronous-prefix/result separation. Ordinary observer exceptions should be
   reportable without accidentally abandoning the rest of a notification.

The exact API name/signature is not prescribed. If an existing public operation
already provides these guarantees, please identify its required ownership and phase
contract and demonstrate the ordering cases below. Nested source execution or an
undocumented internal-queue import is not an acceptable substitute.

## Required acceptance cases

- Queue guest Promise reaction A, perform an observed mutation, queue guest Promise
  reaction B, then log the synchronous end marker. With the observer registered
  first, the order must be sync-end, A, observer, B. Multiple synchronous mutations
  must coalesce the notification request without losing records.
- Two observers are pending together. Observer one queues a guest reaction and
  mutates again; observer two must run before that reaction and see its then-current
  queue. Observer one's newly queued records belong to a later notification.
- An async observer executes its prefix and returns a never-settling Promise. The
  second observer and later guest jobs must progress; the tail remains subject to
  bounded callback ownership rather than being forgotten or awaited for ordering.
- An ordinary throw in one observer is reported while remaining observers run.
  Budget exhaustion and realm abort instead produce the documented fatal outcome.
- Cooperative interpreter yields during a long synchronous guest computation must
  not cause premature observer delivery simply because host microtasks can run.
- Enqueue from a native idle mutation, abort before delivery, and verify no callback
  executes and queued ownership returns to baseline. Also close during a pending
  prefix and verify late phase settlement cannot resurrect a notification.
- Run the cases against the published public extension entry point under Node and
  Bun, with declared limits, cleanups and artifact/provenance evidence. Native mock
  controller tests alone do not close this released-runtime gate.
