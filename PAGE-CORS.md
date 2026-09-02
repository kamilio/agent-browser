# Page-fetch CORS policy

Status: September 2, 2026. `PAGE-FETCH.md` now supports cross-origin requests in
the default `cors` mode, with response permission checks, preflights and redirect
state. This replaces the earlier blanket cross-origin rejection. It is a tested
policy implementation stage, **not full Fetch conformance or live-site acceptance**.
No dependencies, SafeJS edits or external browser engine are introduced.

## Implemented path

- Each cross-origin request carries our serialized document Origin. Responses
  need a matching Access-Control-Allow-Origin, or `*` without include credentials.
  Include credentials additionally require exact `Access-Control-Allow-Credentials:
  true`. Missing, mismatched or duplicate origins do not grant body access.
- Non-safelisted methods or header values trigger an OPTIONS preflight. Its method
  and sorted lowercase unsafe-header names describe the later request; it carries
  no application body, application headers or cookies. Only a successful 2xx
  response granting origin, credentials, method and headers permits that request.
- Method/header wildcards do not grant credentialed permission. Authorization
  always needs explicit header approval rather than wildcard approval. The actual
  response still undergoes CORS checks after a successful preflight.
- Guest-visible response headers are the safelisted names plus valid exposed
  names. Expose `*` expands only without include credentials. Set-Cookie remains
  hidden in all cases. Malformed exposure lists grant no extra headers.
- Redirect responses must pass their own CORS check before another hop is sent,
  including when the caller requested manual redirect handling. Preflight
  redirects are rejected rather than followed. Authorization is stripped when
  the origin changes; previous method/body rewriting rules are retained.
- Response CORS taint stays set even if a redirect returns to the document origin.
  Default same-origin credentials consequently stay omitted on that path. Origin
  serialization becomes `null` once the redirect chain changes origin away from
  an origin other than the original document origin. Each later response must
  grant the currently serialized Origin, not an earlier one.
- Existing conservative SameSite redirect context reaches the cookie adapter.
  `mode: "same-origin"` still rejects cross-origin targets before transmission.
  Mixed-content downgrade, URL credentials, CSP, DNS/private-address policy and
  TLS protections are not bypassed by CORS permission.

## Architecture and limits

`src/cors.ts` owns safelist, permission and header-filter rules. `PageFetch` applies
them while holding the existing bounded request/deadline/body owner. A trusted
`PageFetchRequestContext` marks CORS/preflight calls at the session port; this
context is not a guest-visible fetch option. Standalone host adapters receive it
as the optional second transport argument. All guest CORS enforcement remains in
`PageFetch`, even if a custom adapter ignores that metadata.

The session still supplies the real document cookie context and forces manual
redirect handling. It records OPTIONS checks as `preflight`, distinct from `fetch`
hops. The raw document port without explicit trusted CORS context still rejects
cross-origin access. Page fetch is the guarded capability granted to guest code,
not that raw port.

Preflights share the fetch deadline and cancellation scope. Their response bytes
count against the existing single-response and cumulative body limits. Session
request ceilings are not increased to accommodate them. No permission cache is
implemented: repeated unsafe cross-origin requests are preflighted again, and
Access-Control-Max-Age does not retain permissions. Capabilities expose
`pageFetch.cors: true`, `partial: true`, and `preflightCache: false`.

## Diagnostics and unfinished work

The journal describes transport attempts. A 200/204 entry marked complete means
the HTTP adapter completed, **not that CORS let the guest read the response**.
CORS failures reject the fetch Promise after transport completes. The separate
`cors` field now records each observed hop's permission result without changing
its HTTP state. `NETWORK-JOURNAL.md` defines pending, allowed, blocked and
not-checked results; allowed is not a guarantee of full fetch success. Existing
transport/CSP policy failures still have their own recorded error codes.

Still required: real wire-level/multi-origin cookie and credential checks,
public-site and separate-process acceptance, broader standards fixtures, permission
caching, private-network access protocol support, XHR, no-cors opaque fetching,
guest signals, streams/binary bodies, full Headers/Request/Response semantics and
the wider task/microtask lifecycle. Existing SameSite/PSL limitations remain.
CORS permission is not protection against arbitrary side effects of simple HTTP
requests: do not interpret a rejected response as proof that no request was sent.

No new live server, browser UI, PTY, child process or public network request was
run for this checkpoint. Previously denied acceptance gates remain unverified and
were not replaced by another route.

## Evidence

- `reports/page-cors-focused-2026-09-02.json`: 215 passing tests across eleven
  files. Covers safelists, unsafe values, credential/wildcard distinctions,
  preflight denial, response filtering, redirect taint/Authorization removal,
  mode/mixed-content checks, cancellation, limits and session metadata forwarding.
- `reports/page-cors-safejs-fixture-2026-09-02.json`: fifteen actual-SafeJS checks
  over an in-memory transport. Cross-origin PUT preflight → JSON → interpreted
  DOM mutation works; denied preflight sends no DELETE. Existing same-origin,
  body/Set-Cookie and pending-request cleanup checks also pass.
- Strict package/changed-test builds and the 168-file Biome check pass.

The same `scripts/check-page-fetch.ts` probe now includes the CORS checks. The
earlier ten-check fetch report remains historical evidence, not a current run.

Primary rules reviewed: `https://fetch.spec.whatwg.org/`, specifically CORS
safelists, preflight fetch/check, response filtering, redirect handling and request
origin serialization. No full standards-conformance claim is made.
