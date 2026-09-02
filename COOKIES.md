# Cookie jars and HTTP session integration

Status: September 1, 2026, 17:32 UTC. Implemented host-side cookie storage and
Node transport integration, not a complete page Fetch/document.cookie API or
browser profile controller. No dependency, browser engine or persistence was added.

## Ownership and API

`CookieJar` owns bounded in-memory cookie state. Separate instances are isolated;
sharing one explicitly lets transports in a profile share cookie state.
Closing a transport does not close its externally owned jar. The profile owner
must call `jar.close()` to release cookies; `clear()` clears an active jar.
Closed jars reject reads/writes. Metrics expose only counts and rejection reasons,
never cookie names, values, hosts or paths.

`BrowserSession` now owns a jar, storage and transport together and closes them
on session closure; its text/JSON integration is documented in `SESSION.md`.
Named persistent CLI profiles and saved cookie state are still unimplemented.

- `setCookie(responseUrl, header, context)` processes one HTTP Set-Cookie field.
- `cookieHeader(requestUrl, context)` returns the matching outgoing Cookie value.
- `setDocumentCookie(documentUrl, value, siteUrl)` applies script-write restrictions.
- `documentCookie(documentUrl, siteUrl)` hides HttpOnly cookies from script reads.

These are trusted-host APIs. Their URLs and context are not caller-controlled page
capabilities. Future VM bindings must derive the current document, ancestor/site
context and credentials policy internally; exposing these functions directly would
allow arbitrary-origin cookie access. Cookie strings and raw network headers are
sensitive values and must not be logged or published automatically.

## Implemented behavior

Host-only cookies match the exact canonical URL hostname, share ports, and do not
match sibling/subdomains. Path matching honors path boundaries and default paths;
outgoing pairs sort by descending path length then original creation order.
Replacing a cookie preserves its creation order. Cookie names/values use an ASCII
syntax subset, preserve valid quoted values and reject control/header injection.
Unknown attributes are ignored; duplicate supported attributes use the last valid
value where appropriate.

Secure cookies require HTTPS for creation and transmission. Insecure origins
cannot overlay/delete same-name secure cookies at matching or more-specific paths.
HttpOnly is hidden from document reads and protected from document overwrite or
deletion. Case-insensitive `__Secure-` and `__Host-` prefixes enforce their required
attributes; `__Host-` requires explicit `Path=/`.

Max-Age takes precedence over Expires. A dedicated bounded legacy cookie-date parser
avoids host-specific Date.parse behavior. Expired entries are pruned, expiry writes
delete matching entries, and persistent lifetimes are capped at 400 days. Session
cookies survive only for the owning jar's lifetime; there is no disk persistence.

SameSite Strict/Lax/None filtering distinguishes safe top-level navigation from
cross-site subresource/unsafe requests. None requires Secure. Cross-site top-level
HTTP responses may create Strict/Lax cookies; cross-site embedded responses and
script setters may not. An omitted/unknown SameSite value uses Lax without an
unsafe-method grace period. A null site is treated as cross-site, not implicitly
trusted. Document reads cannot use the top-level-navigation exception.

## Conservative scope and missing features

**Every Domain attribute is rejected**, even an empty or current-host Domain.
There is no Public Suffix List or registrable-domain implementation. Guessing a
suffix boundary would risk cross-site credential access. Same-site is currently
scheme plus exact hostname, ignoring port; it deliberately under-shares between
sibling subdomains. This breaks some legitimate web sessions and is a compatibility
gap, not evidence of complete cookie support.

**Partitioned cookies are rejected**, not silently stored unpartitioned. CHIPS,
third-party-cookie policy, frame/ancestor contexts, a full Fetch/CORS implementation,
cookie access events, Cookie Store API, named-profile wiring, saved-state import/
export, public-suffix domain cookies and additional prefix proposals remain missing.
Empty-name/non-ASCII/permissive legacy cookie syntax is not implemented. No HTTP
localhost exception relaxes Secure handling. No undocumented fallback supplies it.

Default quotas: 3,000 cookies, 180 per host, 4,096 bytes per complete incoming
Set-Cookie field and 32,768 bytes per outgoing Cookie header. The input-field limit
is deliberately stricter than counting only name/value bytes. Capacity rejects new
cookies instead of evicting existing credentials; replacement/deletion remain
possible. Overlarge outgoing headers fail before transmission rather than returning
a truncated credential set. Quota rejections do not expose rejected values.

## Node integration

Pass `cookieJar` to `NodeNetworkTransport`. Each cookie-enabled request must also
include `cookieContext` with `siteUrl`, `credentials` (`omit`, `same-origin` or
`include`) and optionally `topLevelNavigation`. Without a context, automatic cookie
storage/transmission is omitted. The actual request method overrides context method.
This setting controls cookies only; it is not the page Fetch credentials algorithm.

The transport snapshots context before awaiting DNS, rejects manually supplied
Cookie headers when a jar is attached, and recomputes jar cookies for each redirect
destination/path/method. Same-origin credentials become ineligible after a
cross-origin hop, including a bounce back; SameSite filtering retains cross-site
redirect history. Credentials-omit requests neither read nor update the jar.

Set-Cookie is processed on validated response headers, including manual/error
redirects and responses whose bodies subsequently fail decoding. It is available
before a followed redirect starts. Invalid/unsupported cookies are counted and
ignored, while lifecycle errors abort the request. DNS/address pinning, certificate
verification before HTTP transmission, redirect/decompression budgets, cancellation
and the Node-only networking restriction remain intact.

## Verification

- `src/cookies.test.ts`: 55 unit cases for syntax, scope, path/order, prefixes,
  Secure/HttpOnly, SameSite, legacy expiry, quotas and lifecycle; also pass on Bun.
- `src/node-cookies.test.ts`: 12 local HTTP cases covering redirects, credentials,
  jar isolation/sharing, path changes, cross-site bounces, POST/303, deletion,
  body-error headers, input snapshotting and cleanup.
- `src/node-transport-tls.test.ts`: 6 passing TLS cases, including a populated
  Secure-cookie jar denied before any HTTP reaches a mismatched TLS peer.
- `reports/unit-node-2026-09-01-cookies.json`: all 477 Node tests across 20 files pass.
- `reports/cookie-session-node-2026-09-01.json`: four assertions pass against a
  public HTTP cookie test service using six requests, including two redirects.
  Synthetic-cookie setting, subsequent persistence, independent-jar isolation and
  deletion are verified. No response body, cookie value or echoed client metadata
  is retained. Both transports/jars are closed afterward.

Build, production typecheck, Biome and standalone typechecks of the two new cookie
test files pass. A broader ad-hoc test-source typecheck also included the existing
TLS fixture and found its pre-existing `TLSSocket.servername` typing error. That
fixture's runtime tests pass; the typing failure was not hidden or fixed as part
of this feature. Production compilation excludes test files.

Run the opt-in public probe after building:

```bash
bun run --cwd packages/browser-agent build
bun run --cwd packages/browser-agent check:cookie-session
```

These checks do not exercise parsed HTML, website JavaScript, page bindings or
browser-level navigation. No Kitesurf or Playwright CLI parity row is completed.
Reference algorithms inspected, not copied/vendored:
`https://httpwg.org/http-extensions/draft-ietf-httpbis-rfc6265bis.html` and
`https://datatracker.ietf.org/doc/html/rfc6265`.
