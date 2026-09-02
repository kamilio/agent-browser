# Document-owned page fetch

Later September 2 update: `PAGE-CORS.md` adds checked cross-origin fetch,
preflights, credential/header filtering and redirect state. The initial
same-origin-only checkpoint below is historical where superseded by that update.

Status: September 2, 2026. The browser now grants a bounded `fetch` capability to
its explicitly configured SafeJS page runtimes. Actual interpreted Promise
callbacks fetch JSON and update our retained DOM in an in-memory transport probe.
This is the first page-fetch implementation stage, **not complete Fetch, XHR,
CORS, dynamic-site compatibility or the requested browser superset**.

No dependency or SafeJS modification is required. `PageFetch` uses the existing
public host-object and Promise capabilities; it does not expose Node's global
`fetch`, a native browser, filesystem handles or an unrestricted HTTP client.

## Integration

The owned-process session engine provides the same function as global `fetch`
and `window.fetch`, in both manual page evaluation and opt-in classic scripts.
The service must be built/started with the explicit SafeJS configuration described
in `PROCESS-CLI.md`. Existing running services were not restarted by this change.
The generic SafeJS runtime and a standalone `PageScripts` without a supplied
transport still have no fetch grant.

For a document already open in such a service:

```bash
node packages/browser-agent/dist/src/cli.js -s=research eval 'var response = await fetch("/api/data"); return await response.json();' --json
node packages/browser-agent/dist/src/cli.js -s=research requests --json
```

This example requires that the opened site's `/api/data` really exists and returns
JSON; it is not a claim that an arbitrary website provides that endpoint.

The portable host interfaces are `PageFetch`, `PageFetchTransport`,
`PageScriptOptions.fetch`, `DocumentLoaderContext.fetch`, and `SessionPage.fetch`.
The session supplies one document-scoped port usable during parsing and after
commit. Process configuration can supply serializable `fetchLimits`, not a
function transported over IPC. `capabilities.pageFetch` explicitly advertises
enabled/partial state, supported body readers, CORS policy support, and absent
streaming/guest signals.

## Implemented behavior

- String URLs resolve against the live document base URL. Only HTTP(S), without
  URL credentials, is allowed; fragments are not sent. Cross-origin targets use
  the policy in `PAGE-CORS.md`. Explicit same-origin mode forbids them.
- Default GET plus bounded HTTP method tokens; CONNECT/TRACE/TRACK are denied.
  String request bodies support POST and other body-bearing methods. GET/HEAD
  bodies are rejected. String bodies default to `text/plain;charset=UTF-8`.
- Headers accept string-valued records or string pairs. Names/values and total
  size are bounded. Forbidden request headers are filtered rather than allowing
  guest control over cookies, Host, Origin, proxy headers or `Sec-*` headers.
- `credentials` supports `omit`, `same-origin` (default) and `include`; the session
  supplies the document site and a non-top-level request context to its cookie jar.
  Guest-provided cookie context cannot impersonate another document or navigation.
- The host requests **manual** redirects. The page layer follows permitted
  redirects itself, with bounded hops and POST/303 method/body rewriting; checked
  cross-origin redirects are now supported as described in `PAGE-CORS.md`.
  `redirect: "error"` rejects; `manual` returns an opaque-redirect-shaped response
  with status 0 and no URL, headers or body content exposed.
- Responses expose status, ok, URL, type, redirected, bodyUsed, read-only header
  `get`/`has`, asynchronous `text()`/`json()`, and independent `clone()` bodies.
  HTTP error statuses resolve normally. Text uses UTF-8; non-null bodies consume
  once, including JSON parse failures. HEAD/204/205/304 have null-body behavior.
  `statusText` is empty because the transport does not preserve reason phrases.
- Set-Cookie/Set-Cookie2 never become guest response headers. Header lookups do not
  expose inherited object properties. All returned capabilities revoke on owner
  close; body buffers are released on consumption/close.

Network policy, DNS/address checks, TLS verification, cookie policy and transport
limits remain in the existing adapter. The default Node adapter remains Node-only;
this feature is not a claim of working Bun or Cloudflare networking.

## Ownership and bounds

Default maxima per page owner, all configurable downward:

| Resource | Maximum |
| --- | ---: |
| Fetch calls / pending fetches | 64 / 8 |
| Redirects per call | 20 |
| Request string bytes | 65,536 |
| One response body | 262,144 bytes |
| Retained response bodies | 1,048,576 bytes |
| Cumulative received response bodies | 4,194,304 bytes |
| Response objects, including clones | 64 |
| Fetch deadline | 5,000 ms |

Request/response header payloads are additionally capped at 16,384 code units per
header collection. Clones count against response and retained-body limits; reading
a body does not reset cumulative transfer or request limits. These are explicit
host-capability limits in addition to SafeJS's guest-data budget, not a claim that
guest heap accounting includes opaque host buffers.

The adapter buffers a response before returning it, so the page response bound is
checked after that adapter read. The adapter's own byte/concurrency limits still
bound in-flight reads. These numbers are not streaming limits or peak RSS proofs.

Source deadlines and realm shutdown close the fetch owner and abort its requests.
Document replacement, failed loading, tab close and session close also revoke the
session port. Same-document navigation preserves it. Cancellation settles the page
wait even if a transport ignores its AbortSignal; it cannot forcibly stop an
arbitrary non-cooperative adapter's internal work.

`NETWORK-JOURNAL.md` now includes `fetch` records. Each manually followed fetch
hop is a separate entry. The journal still belongs to the latest network attempt;
it is not an archive of background traffic from an old page retained after a
later navigation failed. The response read by the guest is distinct from the
redacted diagnostic record, which never retains headers or bodies.

## Required next stages

`PAGE-CORS.md` adds CORS/preflight permission, redirect state and header filtering
with negative mock-origin fixtures. Real multi-origin/wire acceptance and broader
conformance remain required. `no-cors` and a preflight cache remain unsupported.

Also incomplete: XHR, Request/Response/Headers constructors and prototype/brand
semantics, iterable headers, guest AbortController/AbortSignal, streams, binary/
Blob/FormData bodies, complete coercions, cache/revalidation, referrer/integrity,
keepalive, and full browser task/microtask phases. A supplied non-null guest signal
or an unsupported active option is rejected, not silently ignored. Undefined
optional fields and a null signal are accepted as absent.

CSP response headers or a connected CSP meta element cause fetch to fail closed;
there is no partial `connect-src` implementation pretending to enforce full CSP.
The current runtime's broader browser API and performance limitations still apply.

## Verification

- `reports/page-fetch-focused-2026-09-02.json`: 198 passing tests across ten files.
  Includes request validation, header filtering, redirects, null/consumed/cloned
  bodies, quotas, deadline/close races, document-port ownership, CSP, capabilities,
  loader and existing command/playground regressions. Transports are in memory.
- `reports/page-fetch-safejs-fixture-2026-09-02.json`: ten passing checks using the
  explicitly selected real SafeJS core. Parsed external script → fetch Promise →
  JSON → interpreted callback → semantic DOM, shared request diagnostics, hidden
  Set-Cookie, repeated body reads and non-cooperative pending-fetch cleanup pass.
- Strict package/changed-test compilation and the 166-file Biome check pass.

Reproduce the interpreter fixture after building the package:

```bash
AGENT_BROWSER_SAFEJS_SOURCE_ROOT=/absolute/path/to/compiled/safe-js/package \
  node packages/browser-agent/dist/scripts/check-page-fetch.js --trace
```

No new public network request, server, PTY, child process, service activation or
visual UI run is claimed. Separate-process CLI/wire-level and real-site fetch
acceptance remain unverified; this is not a substitute for denied live gates.

Primary design reference reviewed: `https://fetch.spec.whatwg.org/` (Fetch,
forbidden headers, redirect handling and body consumption). The explicit gaps
here take precedence over any inference of complete standards conformance.
