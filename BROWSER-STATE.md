# Atomic browser-state replacement

September 3, 2026. `exportBrowserState(owner)` and
`replaceBrowserState(owner, input)` coordinate the native cookie jar and local
storage. An owner supplies `{ cookies: CookieJar, storage: BrowserStorage }`;
`BrowserSession` already has that shape. No page-runtime dependency is added.

## Contract

- The versioned envelope is `{ schemaVersion: 1, cookies: [...], origins: [...] }`.
  Cookie entries follow `COOKIE-STATE.md`; origins contain `origin` and
  `localStorage: [{ name, value }]`. This is our schema, not a claim of complete
  Playwright state-file compatibility.
- Replacement prepares detached maps for both owners, checks that both owners
  remain open and that retained session storage fits the profile quotas, and
  only then installs both maps synchronously. The commit steps do not validate,
  read input, call clocks, dispatch events or await work. No rollback is needed.
- Malformed cookies, late storage errors, invalid origins, duplicate keys and
  quota failures leave both owners' stored state unchanged. Cookie expiry uses
  one clock sample, preserves absolute expiry and retains the existing lifetime
  cap. Expired entries are omitted only on successful replacement.
- Owner identities and existing local-storage handles survive; all tabs observe
  the replacement. Session storage, other profiles and cookie acceptance counters
  are not replaced. Successful replacement increments the storage revision once;
  failed replacement does not. Administrative restore emits no page storage events.
- Imports and exports are detached from their owners. The cookie snapshot remains
  frozen; the envelope and local-storage snapshot are ordinary mutable copies.
- Records require exact own data fields and plain/null prototypes. Array elements
  must be own data properties without holes or extra fields. Accessors are rejected
  rather than executed; iterators and `toJSON` hooks are not called. Local-only
  replacement uses the same stricter checks. Canonical origin normalization remains
  supported, including detection of duplicates after normalization.
- Local-storage entry and UTF-16 byte totals are bounded while staging, not merely
  after constructing every origin. Existing session areas count toward final profile
  quotas. Cookie byte/count limits remain unchanged. File byte limits remain a
  separate, unimplemented boundary.

## Safety and remaining gates

The result contains credentials, including HttpOnly cookie values. Do not print
or send it to page JavaScript, logs, traces or public reports. Validation diagnostics
do not include imported credential values. This native host API is not a hostile
JavaScript-object sandbox: proxies, modified owner methods and custom host callbacks
remain trusted embedding behavior, not page capabilities.

The symbol-keyed preparation protocol is internal coordination, not a supported
deferred transaction API. Public replacement consumes prepared state immediately.

## Native validation

On Node v22.22.0, forty new cases pass. The focused cookie/storage regression run
passes **157 tests across five explicit files**; the full working tree passes
**5,843 tests across 180 explicit native files**, with no failed or pending tests.
Production compilation, strict checking of all five focused test files, and
five-source lint/format checks pass. Results were printed to the terminal, not
written as new machine-readable reports.

The isolated change also passes production typechecking and **3,083 tests across
119 available allowlisted files** in a temporary checkout based on the preceding
commit, without the pre-existing unfinished features. No files missing from that
checkout were replaced with alternate tests.

The first focused run failed in two new test fixtures: the initial profile did
not fit its configured byte quota, and a credentials-in-URL rejection expected
the wrong error code. Both expectations were corrected before the passing runs;
no production policy was relaxed to satisfy them.

Next: private-file `state-save`/`state-load`, bounded file reads, private permissions,
atomic writes, symlink handling and CLI failure/recovery tests. No authentication
reuse, live site, socket, real TTY/PTY or SafeJS acceptance is claimed here.
