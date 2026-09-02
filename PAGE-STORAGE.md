# Page storage and cookies

Status: September 2, 2026. Explicitly enabled page JavaScript can use the existing
session-owned stores through `localStorage`/`sessionStorage` methods and
`document.cookie`. This is partial Web Storage, not a new storage engine or a
complete compatibility claim. No dependency or native browser was added.

## Supported contract

- The session installs an owned storage port before parser scripts execute.
  `localStorage === window.localStorage` and the equivalent sessionStorage
  identity remain stable within one realm; the two areas are distinct.
- `length`, `key(index)`, `getItem(key)`, `setItem(key, value)`, `removeItem(key)`
  and `clear()` operate synchronously on the actual native BrowserStorage maps.
  Missing values return null. Keys/values use primitive DOM string conversion;
  key indices use primitive unsigned-32-bit conversion. Required arguments are
  checked, and guest object conversion hooks are not executed on the host.
- Local storage is shared by canonical origin within one BrowserSession.
  Session storage is additionally scoped to a tab. Opener data is cloned once,
  not shared thereafter. Cross-origin navigation cannot see another origin's
  data; returning restores the retained area. Independent sessions are isolated.
- Native state imports are immediately visible through an existing live binding.
  Methods do not keep a second guest copy of the stored data. The existing native
  byte/entry/area/tab quotas apply atomically to writes.
- Reload creates new revoked-old/live-new capabilities while preserving stores.
  Closing a realm revokes its bindings, not persistent session-owned state.
  Closing a tab deletes its session area; closing the BrowserSession clears both
  stores. Local data is in-memory for that session's lifetime, not automatic disk
  persistence across CLI process/session restarts.

## Document cookies

`document.cookie` reads and writes the same CookieJar used by the owning session.
It uses the actual document URL, never a foreign `<base>` URL. Same-origin
history path changes immediately affect path-scoped cookie visibility.

HttpOnly values are not exposed, overwritten or deleted by script. Script writes
cannot create HttpOnly cookies. Secure, path, expiry/deletion, prefix, host and
the existing cookie resource policies apply. Invalid or unsupported cookie
writes are silently rejected by the jar and recorded as reason/count metrics;
the binding does not expose cookie values in diagnostics. The jar intentionally
supports host-only cookies: Domain and Partitioned attributes are rejected.
No frames or third-party storage model is added by this work.

## Ownership and limitations

Standalone runtimes with no session-owned port do not fabricate persistent
storage or document cookies. Candidate scripts have authorized access before
commit; their writes are not rolled back if later parsing/navigation fails.
Realm/document/tab/session close prevents retained page capabilities from being
used to access another owner or a future replacement document.

**Use explicit Storage methods. Named property assignment/deletion/enumeration is
not implemented.** In the current experimental core, `localStorage.name = value`
does not persist to the native map and can appear to succeed. The exact observed
behavior is retained as `namedPropertyObservation` in the fixture report, not
counted as a passing Web Storage feature. There is no guest mirror or predeclared
key workaround. Upstream enhancement `poe-platform/poe-code#549` requests bounded
named setters/deleters; #546 intentionally provided only read-only named access.
Current upstream source and the experimental runtime are distinguished in
`SAFEJS-UPSTREAM-MIGRATION.md`.

Bounded cross-document storage events are now implemented in `STORAGE-EVENTS.md`.
Named properties, Storage constructors/prototypes, complete
Web IDL coercion/DOMException identities, partitioned/third-party storage and
automatic durable persistence remain incomplete or unverified. Capability
metadata reports `pageStorage.partial`, `namedProperties: false`,
`storageEvents: true` with a bounded scheduler and
`persistence: "in-memory-session-lifetime"`.

## Evidence

The later `STORAGE-EVENTS.md` checkpoint adds native mutation notifications,
candidate-aware delivery and an interpreted cross-tab UI workflow. The reports
below retain the original method/cookie checkpoint before those additions.

`src/script-storage.test.ts` covers pre-parser ownership, live native state,
reload, origin/tab/session isolation, opener copying, primitive conversion,
required arguments, atomic quotas, native state import, cookie scope/HttpOnly,
unsupported attributes and revocation. Native storage/cookie and existing browser
regressions are included in `reports/page-storage-focused-2026-09-02.json`: 707
passing tests across 36 files, including 27 page-binding cases. Strict package/test
compilation and formatting pass. Existing actual-interpreter navigation (21
checks) and fetch/CORS (24 checks) also pass after adding the storage bindings.

`scripts/check-page-storage.ts` uses actual experimental SafeJS and the
self-authored `fixtures/storage-todos.html`. Twelve workflow checks drive real
agent fill/click operations through interpreted submit/click handlers, add/toggle/
remove todos, reload and verify rendered persistence, then test isolation and
HttpOnly protection. The unsupported named-write observation is separate from
those twelve checks. Results: `reports/page-storage-safejs-fixture-2026-09-02.json`.

Run the built probe with `check:page-storage` using the explicitly configured
existing experimental SafeJS source root. All responses are in-memory. This does
not exercise a real website, public TodoMVC/framework code, an actual cookie wire
exchange, live PTY, deployed playground, new release or previously denied gate.
It is evidence for the implemented API/workflow only, not the full browser goal.

## Standards targets

- HTML Web Storage: https://html.spec.whatwg.org/multipage/webstorage.html
- HTTP cookie processing: https://httpwg.org/specs/rfc6265.html
