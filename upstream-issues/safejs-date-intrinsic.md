# Bounded, replay-aware Date intrinsic for page libraries

Related browser work: #540, #541 and #542. After the local v13.0.10-based candidate
adds guest function properties/prototypes, real jQuery from Quotes to Scrape gets
past that blocker and fails at its `now: Date.now` initialization.

The actual public-core reproduction is simply `Date.now()`, which throws
`ReferenceError: Identifier 'Date' is not defined.` The selected local candidate
is based on commit `7fbbd81fd99c46928bcf314ad89410b946d203cc`; upstream main has
not been executed for this report. No browser-specific source rewriting or dummy
Date object is used.

## Requested capability

- Implement the standard Date intrinsic inside SafeJS, not by injecting native
  constructors/prototypes from each browser adapter.
- Support `Date.now`, construction from epoch/time strings, UTC/date accessors,
  `getTime`/`valueOf`, `toISOString`, invalid dates and normal identity/type behavior.
  Clearly enumerate any intentionally unsupported methods rather than stubbing.
- Use the existing clock/replay ownership model for current-time reads; preserve
  deterministic snapshots where the caller explicitly configures that behavior.
- Bound parsing/formatting and account for retained values. No ambient native
  prototype, process or filesystem access through Date values or methods.
- Define copy/snapshot/replay behavior explicitly, including invalid dates and
  mutation. Preserve realm isolation and cancellation/budget rules.

Acceptance should include `new Date(0).toISOString()` returning
`1970-01-01T00:00:00.000Z`, configured-clock `Date.now`, invalid-date behavior,
cross-realm isolation and the real jQuery initialization site. No new dependency
is requested. This report requests upstream work; it does not claim a Date
implementation or passing public dynamic-site compatibility.
