# Storage change events

Status: September 2, 2026. The browser now schedules bounded storage events for
session-owned documents. This extends the explicit Storage method bindings in
`PAGE-STORAGE.md`; named Storage syntax remains a separate unsupported feature.

## Mutation and delivery contract

BrowserStorage captures a frozen change record after a successful set, remove or
clear. Identical-value writes, missing-key removal, empty clears and rejected
quota writes emit nothing. Data changes synchronously, before notifications.
Records contain the kind, origin, tab, canonical source URL, optional opaque
source owner, key and old/new string values. No second data store is introduced.

The owning session filters recipients before queueing:

- Local changes reach other registered same-origin documents, not their source.
- Session changes additionally require the same tab. Opener clones and different
  tabs are not a shared session area. Same-tab multi-document routing is tested
  in the coordinator; this does not implement frames.
- Page writes identify their actual document and capture its current URL,
  including same-origin history path/query/fragment changes, at mutation time.
- Explicit native Storage methods with no source owner are treated as external
  changes and can notify the current page. Native state import, opener cloning,
  tab removal and session teardown are administrative operations, not individual
  web writes, and do not broadcast a synthetic series of change events.

Events run in later host tasks, in queue order among eligible documents. The
receiver's existing event dispatch finishes first. Candidate documents retain
queued notifications until commit; failed/retired candidates lose them. Event
listener synchronous prefixes are awaited using the existing SafeJS callback
contract; complete browser task/microtask semantics are still not claimed.

The actual Window event has `type: "storage"`, non-bubbling/non-cancelable flags,
`key`, `oldValue`, `newValue`, `url` and `storageArea`. Clear uses null for all three
key/value fields. The interpreted storageArea is the **receiving realm's own**
localStorage or sessionStorage capability, with stable identity. Event data is a
captured change; querying its live area may return a newer value.
The SDK exports `BrowserStorageEvent` and the `StorageMutation` type. This does
not provide the standard guest `StorageEvent` constructor.

## Budgets and lifetime

One session coordinator permits at most 256 registered documents, 128 queued or
active deliveries, a 1 MiB retained-data charge and 4096 accepted deliveries over
its lifetime. The data charge includes UTF-16 URL/key/value sizes and a fixed
record allowance; it is not an RSS measurement. Tests use smaller limits.

When delivery capacity is exhausted, committed storage is retained but excess
notifications are dropped. This intentional resource limitation is observable
through `metrics.storageEvents`: accepted, delivered, canceled, dropped, failed,
pending/active status and retained/peak bytes. Payload keys, values and URLs are
not included in metrics. Cancellations do not reset the lifetime budget.

Closing a recipient cancels its pending work and interrupts active event-prefix
waiting without blocking other recipients. Closing the session unregisters
documents and cancels its queue. Stop-loading does not cancel unrelated storage
notifications. Listener errors use the existing event/script error channels;
native observer failures are isolated from committed data and counted without
including raw exception text.

## Evidence and remaining scope

`reports/storage-events-focused-2026-09-02.json` covers native mutation metadata,
filtering, no-op/quota suppression, ordering, candidate activation, cancellation,
native imports, resource limits and existing browser regressions. Session-level
cases verify dynamic source URLs and failed-candidate cleanup.
The checkpoint records 723 passing tests across 37 files, including thirteen
coordinator/observer cases and thirty page-storage integration cases.

`reports/storage-events-safejs-fixture-2026-09-02.json` uses the actual experimental
core and self-authored todo fixture, with nineteen passing checks. In addition to the earlier storage workflow,
it checks interpreted cross-tab event fields and receiving-area identity, source
exclusion, session isolation, external native writes and clear. An agent action
in one tab rerenders the second tab through its real interpreted storage handler,
without a new response or document reload.
The existing interpreted navigation (21 checks) and fetch/CORS (24 checks)
regressions also pass. Strict package/test compilation and formatting pass.

These are in-memory fixtures, not public TodoMVC/framework, live network/cookie
wire, terminal PTY or deployed-playground acceptance. Named Storage properties,
StorageEvent construction/prototype conformance, frames, third-party/partitioned
storage and complete browser scheduler/event conformance remain incomplete.
Capability metadata keeps `pageStorage.partial: true` and reports the bounded
session task queue explicitly. The full 72-hour browser goal remains active.
