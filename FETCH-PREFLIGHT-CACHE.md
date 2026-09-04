# Bounded page-fetch preflight cache

Native implementation checkpoint, September 4, 2026. This extends the connected
`PageFetch` path; it does not replace its transport or page runtime.

## Behavior

- Each `PageFetch` owner retains successful CORS preflight method/header grants.
  Later requests can reuse a different granted method or header, not just repeat
  an identical request. Permissions from separate responses can combine.
- Keys include the serialized request origin and exact canonical URL. Queries
  remain distinct; fragments have already been removed by `PageFetch`. Redirect
  targets and redirect-tainted `null` origins need their own permissions.
- Credentialed grants can satisfy noncredentialed requests, but not conversely.
  Method matching is case-sensitive; header matching is case-insensitive.
  Noncredentialed wildcards never grant `Authorization`. Stars received with
  credentialed permission are retained only as literal tokens, not widened into
  wildcard permissions for later requests.
- Cache hits skip OPTIONS only. Actual requests still run transport validation,
  CORS checks, cookie policy, redirect handling and response ownership checks.
  `cache: "no-store"` does not disable this separate permission cache or cause
  response bodies to be cached.
- Failed preflights never publish grants. Request failures conservatively clear
  all credential variants for the current origin/URL, including actual CORS,
  transport and response-publication failures. Other keys remain available.

## Bounds and lifetime

- At most 256 entries and 65,536 retained string code units per owner. Each method
  or header is an entry; accounting includes its origin, URL and token. Oldest
  entries are evicted when admitting a grant would exceed either bound. An entry
  larger than the complete string budget is not retained.
- Missing or invalid `Access-Control-Max-Age` defaults to five seconds. Valid
  digit-only values are capped at 7,200 seconds; zero does not retain a grant.
  Refreshing an exact grant replaces its deadline without adding duplicates.
- Lookup and insertion remove expired entries. Idle expired entries can remain
  allocated within the hard bounds until the next operation or owner teardown;
  they cannot authorize a request after expiry. No background timer is needed.
- The native monotonic clock defaults to `performance.now()`. A native-only
  `preflightClock` option supports deterministic tests. Clock exceptions,
  nonfinite/unsafe readings or regression discard permissions and bypass caching,
  not preflight validation. No clock callback is exposed to guest code.
- Closing the document/owner clears entries and permanently disables insertion.
  `metrics().preflightCache` contains retained entry/string counts, successful
  clock lookup hits/misses and capacity evictions, never URLs or header values.
  Existing `preflights` continues to count actual OPTIONS attempts.

## Evidence

Four of six initial native integration regressions fail before implementation.
The completed addition has 36 cache tests and 18 page-fetch integration tests.
Focused validation covers these plus existing page-fetch, ownership, journal and
page-binding tests: 147 tests across six explicitly allowlisted files pass.
The existing no-cache expectation is updated to expect permission reuse; its
preflight response-body quota assertion remains unchanged.

Full native validation passes 7,823 tests across 222 files. A separate snapshot
of committed HEAD plus only this owned patch passes 5,063 tests across its 161
available allowlisted files. Both trees pass production and new-test typechecks,
builds and six-file Biome checks. The isolated run intentionally does not include
the pre-existing pending feature files; their absence is not a skipped failure.

## Limits and gates

The cache is deliberately per-owner, narrower than a browser-wide network
partition. It is not persisted, shared across pages, or an HTTP response cache.
Concurrent misses are not coalesced. It uses conservative early eviction rather
than promising exact cache lifetime or complete Fetch conformance. Existing
unsupported fetch modes, request bodies/streams and guest cancellation limits
are unchanged. No new runtime dependency is introduced.

The previously requested SafeJS fetch probe was denied and has not been retried.
No `reports/page-fetch-ownership-safejs-2026-09-04.json` was produced. This change
uses native mock transports only, with no SafeJS execution, live website, socket
or real TTY/PTY probe. These independent acceptance gates remain open; native
results do not establish released-runtime or website compatibility.

## Research

Reviewed the primary [Fetch Standard CORS-preflight fetch algorithm](https://fetch.spec.whatwg.org/#cors-preflight-fetch)
and [CORS-preflight cache](https://fetch.spec.whatwg.org/#cors-preflight-cache)
on September 4, 2026 for method/header grants, credential matching, exact URL and
origin keys, default/clamped max-age and permission eviction. Credentialed star
tokens deliberately retain their literal interpretation rather than broadening
the originally validated permission.
