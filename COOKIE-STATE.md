# Native cookie-state persistence

September 3, 2026. `CookieJar.exportState()` and `CookieJar.replaceState(input)`
provide a bounded, versioned persistence primitive for the native browser owner.
They are not exposed to page JavaScript and do not yet implement CLI file-based
`state-save`/`state-load`.

## Contract

- State is `{ schemaVersion: 1, cookies: [...] }`. Each entry preserves `name`,
  `value`, canonical host, path, Secure, HttpOnly, SameSite and absolute expiration.
  Expiration is epoch milliseconds or `null` for a session cookie. This is a native
  schema, not a claim of Playwright storage-state JSON compatibility.
- Export returns detached immutable records in creation order, omits internal
  sequence counters, and prunes expired cookies using the jar's existing clock.
- Replacement validates the entire supplied state before replacing anything. It
  replaces rather than merges, preserves ordering, skips expired cookies and caps
  future lifetimes using the jar's existing 400-day policy. It does not restart a
  saved cookie's lifetime or increment Set-Cookie acceptance/rejection counters.
- The supported profile remains host-only cookies. Unknown fields, Domain and
  partitioned metadata, duplicate identities, malformed values and invalid security
  combinations fail closed rather than being silently discarded.
- Serialized state is bounded to 16 MiB. Existing per-cookie, per-host and total
  cookie limits also apply. Export can fail for a large jar configured beyond the
  state limit; import failure leaves the previous jar intact.
- Input is JSON-shaped plain data, not a JavaScript serialization system. Sparse
  arrays, own accessors and coercion-based field values are rejected. This is not
  a sandbox for arbitrary host-language Proxy objects.

State includes cookie values and HttpOnly cookies. It is sensitive owner data:
do not print it into logs, traces or public reports. Future CLI persistence must
use explicit private files and validate both cookie and local-storage state before
committing either owner. This primitive alone does not supply that file boundary
or a combined cookie/storage transaction.

## Evidence and limitations

Thirty-nine new native cases cover JSON round trips, headers and script-visible
filtering, host/path/port isolation, ordering, immutable snapshots, absolute expiry,
lifetimes, detachment, invalid records, late failures, quotas, byte limits,
accessors, IPv6 and the network URL length boundary. Existing cookie and storage
regressions continue to pass: **104 tests across three explicit files**. Production
compilation, strict checking of both cookie test files and three-file lint/format
checks pass.

The full working tree passes **5,803 tests across 179 explicit native files**.
The staged cookie-state change also builds independently of existing unfinished
work and passes **3,043 tests across its 118 available allowlisted files**. Both
runs have zero failed/pending tests and exit 0; results were printed, not written
as new machine report artifacts.

All cookie values are synthetic, clocks are controlled, and no website, socket,
real TTY or SafeJS probe runs in these tests. Full cookie conformance, private-file
round trips, CLI integration and real authentication reuse remain open gates.
