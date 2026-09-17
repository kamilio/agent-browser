# Native module dependency resolution — September 17, 2026

## Delivered browser change

The existing explicit SafeJS module adapter can now obtain dependencies through
an opt-in `networkSourceModules` registry. It uses a supplied native policy-fetch
callback, resolves URL-based imports, enforces source/MIME/CORS bounds, shares
in-flight requests and preserves cached failures without retry. Owner/realm
closure revokes pending resolutions; individual caller cancellation does not
poison another caller's shared request.

The implementation snapshots entry source/configuration, preserves exact entry
validation and classic defaults, and rejects simultaneous static/network graphs.
It adds no dependency, global network client, package resolution or alternate
engine. Full API and bounds: `NETWORK-SOURCE-MODULES.md`.

This is a dependency-source integration step, **not completed JavaScript-heavy
website support**. Actual SafeJS execution and the HTML module loader remain
unqualified/unimplemented respectively. The callback-tail scheduling blocker
and all existing SDK acceptance expectations remain unchanged.

## Native qualification

**362 passed, zero failed, across11 selected explicit native test files**,
including64 registry and16 extension-integration cases. Build, selected strict
test types, formatting and lint all pass. Tests run from a protected snapshot of
commit`6cf152fd64195e2aad524d0fd6fcb1950ea8856a` plus only owned overlays, not the
dirty-root runtime. All1,629 source and2,412 compiled artifacts are inventoried.

The same final tests against the unchanged extension adapter, with the new
standalone registry present, give350 passed/12 failed. This demonstrates missing
adapter integration; it is not an old implementation of the new registry.

Preserved development runs:

| Run | Passed | Failed | Interpretation |
| --- | ---: | ---: | --- |
| core01 |351|1|Mixed-case Content-Type rejected; one test-only type assertion also needed correction |
| core02 |357|5|Four new registry regressions plus an incorrect CSP-observation expectation |
| release01 |361|1|Registry regressions fixed; same CSP test expectation still failed |
| release02 |362|0|Final selected native and quality gates pass |

Independent review identifies case-insensitive MIME handling, request-cache
precedence over later redirect aliases, and final fragment-composed identity
bounds. Regressions also reject malformed scalar MIME values. The fixes preserve
request success identity and failure memoization rather than hiding retries.
The native fetch composition test now correctly expects CSP checks before and
after each response and omitted cross-origin credentials under same-origin
policy; no production CSP/credential behavior is weakened.

All native/quality child processes and groups close, with empty native HOME/TMP.
The1,020-entry manifest retains22 absent committed files. This is not a new full
native-suite, actual SDK, authenticated, device, socket-fixture or TTY gate.

## One real module-source acquisition

The earlier captured MDN module guide explicitly declares
`/static/client/runtime.c37879fb998950e5.js` as a module script. Its original
September17 00:25:27.877 UTC HTML capture is verified locally and not fetched
again. A separate scoped check invokes the new registry against that exact URL
through `fetchScriptResource` and `NodeNetworkTransport`.

| Measurement | Observed result |
| --- | --- |
| URL | `https://developer.mozilla.org/static/client/runtime.c37879fb998950e5.js` |
| Received UTC | September17,2026 17:41:06.629 |
| HTTP/type/MIME |200 / basic / text/javascript |
| Native requests |1 GET,0 redirects,0 retries |
| Decoded/source bytes |19,705 |
| Encoded bytes |8,724 |
| Source/body SHA256 |`05b2ec0aaa56f1462f9409c87ea173a7d7d1426eb4723c7d69cb9552ab25d337` |
| Repeated resolution |Same immutable source object, no additional policy or transport call |
| After owner abort |Further resolution rejected |

The entry used to invoke this dependency resolver is explicitly host-owned
inert source. Neither that entry nor the downloaded MDN source is evaluated.
No page, SafeJS realm, credentials, cookies, device, TTY, alternate client or
challenge solver is involved. Source is stored as inert text; decoded body and
saved source hashes match. No challenge is encountered, so this is not a
challenge-avoidance result or a working scripted MDN application.

A matching synthetic driver first passes under kernel and JavaScript network
denial with zero wire requests. The live check then passes with one observed
completed response and request/response/socket closure, zero active transport
operations, closed empty cookie jar and absent child/group. Its0.370-second
supervised duration is one observation, not a benchmark. Two resolver calls
using one fetch demonstrate this scoped reuse, not an overall browser speedup.

## Remaining work and evidence

Continue HTML module discovery/order/lifecycle, actual qualified SafeJS execution,
callback scheduling, diverse dynamic websites and real cross-origin module
graphs. Preserve historical100-page outcomes at33 useful/67 other. Credentials,
passkeys, broader access/CAPTCHA friction, full performance coverage and original
research topics remain open.

Adjacent JSON records the qualification, live result, source identities and
sealed evidence. Private lanes:
`node_modules/.cache/native-validation/network-source-modules-september17/` and
`node_modules/.cache/native-validation/network-module-asset-live-september17/`.
Pre-existing work is preserved; no push occurs. The browser goal remains active.
