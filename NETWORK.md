# Network adapter status and boundaries

This is an implemented host HTTP transport, not the page's Fetch API or a
completed browser. It supports the independent TypeScript engine without a
Chromium, Firefox or remote-browser dependency. No dependencies were added.

## Supported host

Use **Node.js** for networking. The verified version is Node 22.22.0 on Linux.
The core document, snapshot, CLI-parser and network-policy modules also run on
Bun, but constructing `NodeNetworkTransport` on Bun fails closed with an
`unsupported` error before any DNS query or connection.

The restriction is intentional. Local TLS tests on Bun 1.3.8 found that its
Node HTTPS shim did not invoke the supplied identity callback. A subsequent
native-fetch experiment rejected a mismatched hostname only after the local
HTTPS server had received an HTTP request. Rejecting the response is too late:
credentials or a mutating request could already have been transmitted. Neither
path is retained as a production fallback. Do not remove the guard simply
because a public-site GET succeeds.

Reproduce the local-only native-fetch finding with:

```bash
bun packages/browser-agent/scripts/check-bun-tls-ordering.ts
```

An exit code of 1 and `passed: false` mean the runtime fails the required
pre-request identity check. The probe uses only the deliberately public test
certificate and a temporary loopback server; it closes the server afterward.
Before enabling any other host, pass the full TLS suite with both successful
connections and rejection **before any HTTP request reaches the server**.

## API and build

From the repository root:

```bash
bun run --cwd packages/browser-agent build
bun run --cwd packages/browser-agent test
bun run --cwd packages/browser-agent check:network-sites
```

Builds use the repository's existing TypeScript toolchain. The resulting ESM
library and declarations live in `dist/src`. Consumers import the core from
`@automations/browser-agent` and the host adapter from
`@automations/browser-agent/node`. No browser executable is required.

`NodeNetworkTransport.request` accepts an HTTP(S) URL, method, string headers,
an optional string/byte body, redirect mode, abort signal and cookie context. It returns final
URL/status, duplicate-preserving response headers, decoded body bytes, redirect
history, encoded-body byte count and elapsed time. HTTP error statuses are
responses, not transport exceptions. `decodeResponseText` handles a declared
HTTP charset or a caller-selected fallback, with Unicode BOM precedence.
HTML meta-charset sniffing still belongs to the future HTML loader.

`close()` aborts outstanding work and permanently closes that transport.
Metrics are immutable snapshots. Request counts include attempted hops/DNS
lookups; encoded and decoded counters measure body bytes, not TLS/header costs.
They include bytes observed before a quota rejects a chunk.

The optional `requestWithRoutes(request, resolveRoute)` API uses the same native
driver, consulting a synchronous trusted resolver before each hop's DNS/exchange.
Its metadata argument contains URL, method and signal only. The session supplies
its own `NetworkRoutes.fulfill`; no guest handler or unrestricted browser engine
is exposed. Routed responses are validated, headers normalized and copied, and
body ownership detached. Invalid results fail rather than triggering a real send.

Request, response/header, redirect and cumulative decoded-body limits still apply.
Mocked attempts and decoded bytes are included in the main counters; optional
`mockedRequests` and `mockedDecodedBytes` identify their subsets. These include
validated mock data observed before a byte-limit rejection. Encoded counters
remain actual encoded stream bytes. A monotonic deadline check also detects
overdue synchronous routing work between async checkpoints, without claiming to
preempt arbitrary host callbacks. `ROUTING.md` documents the
adapter-dependent fallback and the mock-only validation evidence for this change.

Optional externally owned `cookieJar` state enables bounded cookie sessions when
requests include an explicit cookie/credentials context. Redirect response cookies
are processed before following; outgoing jar cookies are recomputed for every hop,
not copied across paths or hosts. `COOKIES.md` defines the security boundary and
unsupported Domain/Partitioned scope. Closing a transport does not close the jar.

## Enforced transport policy

- HTTP(S) only; reject URL credentials, control characters and oversized URLs.
- Block Fetch's bad-port list, including when a local origin is explicitly
  allowed. Private-origin permission does not permit unrelated protocols.
- Deny private, loopback, link-local, shared, documentation, multicast and
  reserved IP ranges by default. The IPv6 policy permits ordinary global
  unicast only and excludes translation/tunnel/special-purpose ranges.
  Some globally reachable special-purpose anycasts are deliberately excluded.
- Validate every A/AAAA result and every redirect. Dial the selected validated
  **literal address** without another hostname lookup. Keep the original HTTP
  authority and validate TLS against the original hostname, not the dialed IP.
- Retain certificate-chain validation. Optional `certificateAuthorities` is a
  trusted host configuration that replaces the default CA list; it never turns
  verification off. No OS trust store or global TLS setting is changed.
- Strip Authorization, Cookie and Referer on cross-origin redirects, apply
  POST/303 method changes, preserve bodies for 307/308, and deny HTTPS downgrade.
- Bound concurrent operations, request count, redirects, uploads, headers,
  encoded/decompressed response bodies and cumulative body bytes. One deadline
  covers DNS, connection, redirects and response consumption.
- Decode gzip, deflate and Brotli through bounded streams; reject unsupported
  encodings and malformed compression. Do not retry failed mutations.
- Private access requires exact scheme/host/port entries in
  `allowPrivateOrigins`. An optional origin allowlist is a separate restriction.
  Both are copied at construction and must never come from website JavaScript.

These controls do not replace deployment-level egress restrictions. A trusted
host/operator can alter routing, certificate authorities or the runtime itself.
The adapter implements direct connections; HTTP proxies are not implemented.

## Not implemented yet

- Page-level CORS, CSP, mixed-content and Fetch/XHR behavior. **Never expose this
  raw host transport directly to an untrusted page VM.** Its response headers
  include Set-Cookie and other private session data for future browser internals.
- Domain/partitioned cookies and complete page cookie semantics; automatic
  authentication, referrer policy, cache, downloads,
  WebSockets, streaming page APIs and frame/network partitioning.
- HTML decoding integration, parsing, website scripts and page-driven resource loading.
  `BrowserSession` now loads/reloads real plain-text/JSON documents and handles
  same-tab link intents through its explicit loader (`SESSION.md`).
- A browser session's simulation transport: dry-run must intercept all mutations
  and ensure later reads observe the simulated state before an agent API ships.
- A verified Bun or Workers network backend. Node is the initial supported host;
  the product's lightweight TypeScript/browser scope is unchanged.

## Reference material

Policy and behavior were checked against these primary sources on September 1,
2026. The compatibility ledger still requires browser-level evidence.

- https://nodejs.org/docs/latest-v22.x/api/http.html
- https://nodejs.org/docs/latest-v22.x/api/dns.html
- https://nodejs.org/docs/latest-v22.x/api/tls.html
- https://fetch.spec.whatwg.org/#http-redirect-fetch
- https://fetch.spec.whatwg.org/#port-blocking
- https://www.iana.org/assignments/iana-ipv4-special-registry/
- https://www.iana.org/assignments/iana-ipv6-special-registry/
- https://encoding.spec.whatwg.org/index-windows-1252.txt
- https://bun.com/docs/runtime/networking/fetch

The Windows-1252 mapping is implemented explicitly for consistent web encoding
on the tested hosts; the Node version's native decoder returned U+0080 rather
than the required Euro sign for byte 0x80. This discrepancy has a regression test.
