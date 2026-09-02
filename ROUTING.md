# Session-owned request fulfillment

Status: September 2, 2026. `route`, `route-list` and `unroute` now install, inspect
and remove bounded in-memory responses in our own browser. This is a working
fulfillment stage, **not full Playwright routing or the complete browser goal**.
No dependency, external browser engine or new service is required.

## Commands

Against a newly built/configured browser service, an entirely mocked document can
be set up before navigation:

```bash
agent-browser -s=mock open
agent-browser -s=mock route 'https://demo.invalid/' --body='<h1>Mock page</h1>' --content-type=text/html
agent-browser -s=mock goto https://demo.invalid/
agent-browser -s=mock snapshot
agent-browser -s=mock requests --json
agent-browser -s=mock route-list --json
agent-browser -s=mock unroute 'https://demo.invalid/'
```

These are usage examples, not a claim that a fresh executable/service acceptance
run has been performed. No existing running service was restarted.

Additional examples:

```bash
agent-browser -s=mock route '**/api/users' --body='[{"id":1,"name":"Example"}]' --content-type=application/json
agent-browser -s=mock route '**/*.{png,jpg,jpeg}' --status=404
agent-browser -s=mock route '**/api/data' --body='{}' --header='Access-Control-Allow-Origin: *'
agent-browser -s=mock route '**/old-page' --status=302 --header='Location: /new-page'
agent-browser -s=mock unroute
```

`--status`, `--body`, `--content-type` and repeated `--header='Name: Value'` are
supported for fulfillment. `--headers` also accepts a JSON string-to-string
record as an extension. A body or status must be supplied: rewrite-only routes
and header removal return `unsupported`, rather than silently continuing or
pretending to modify a request.

The reference command family and common examples were inspected in Microsoft's
Playwright CLI request-mocking guide and `packages/playwright/src/mcp/browser/tools/route.ts`.
This implementation does not claim every current upstream option or output shape.

## Ownership and effects

- Rules belong to a named browser session, apply across its tabs and survive
  document navigation. Other sessions cannot see or use them.
- The newest matching rule wins. Repeated patterns are separate registrations;
  `unroute pattern` removes every exact-pattern registration, and bare `unroute`
  removes all rules. Removal affects subsequent requests, not already delivered
  responses. Close releases rules and retained response data.
- Matching document, script, stylesheet, page-fetch and preflight requests receive
  fresh response bytes without calling the underlying network transport.
  HTML parsing, stylesheet processing and page fetch see the actual replacement
  content, rather than a canned command success message.
- Lists return detached metadata: ID, pattern, status, content type and body-byte
  count. Bodies and custom headers are not echoed. Patterns themselves can
  contain sensitive information; treat route listings as configuration data.
- Journal entries carry `routeId`, including through `request <index>` and the
  playground Network pane. Encoded wire bytes are zero for a fulfilled mock;
  an aggregate redirect chain can also include earlier wire bytes. Decoded bytes
  count the final replacement payload. Session `metrics.routes` reports mock-only
  fulfillment and retained/delivered bytes. The route-aware Node transport also
  includes mocked attempts/decoded bodies in its existing transport budgets and
  exposes `mockedRequests` and `mockedDecodedBytes` as subsets of those counters.

The portable API is `BrowserSession.routes`, backed by exported `NetworkRoutes`:
`add(pattern, options)`, `list()`, `remove(pattern?)`, `fulfill(request)`, `metrics()`
and `close()`. No route control is exposed to guest page JavaScript.

## Patterns and limits

Patterns match the complete serialized HTTP(S) URL, including query parameters
but excluding fragments. `*` does not cross `/`; `**` can. `**/` can match zero
directories. Comma braces support bounded alternatives, including nested groups;
backslash escapes the next character. `?` is literal, not a wildcard. Literal
absolute URLs are normalized; full upstream normalization of literal components
inside globs and base-URL-relative patterns remains unimplemented.

Matching uses our bounded state machine, not a user-supplied native regex. Tests
use a native regex only as an independent oracle for small wildcard combinations.

| Bound | Default maximum |
| --- | ---: |
| Live rules per session | 32 |
| Input pattern code units | 512 |
| Expanded alternatives / compiled states per pattern | 32 / 4,096 |
| Matching work units per request across all rules | 2,000,000 |
| One UTF-8 response body | 262,144 bytes |
| Retained rule payloads | 1,048,576 bytes |
| Lifetime fulfilled requests | 512 |
| Lifetime delivered body bytes | 8,388,608 bytes |

Rule payload accounting includes stored body and serialized metadata/headers,
not total heap use; compiled states have their own bounds. Removing routes does
not reset lifetime delivery limits. Invalid and over-budget additions are atomic.
Matching or delivery exhaustion fails closed: it never falls through to a real
network request. The standalone class accepts smaller limits.

## Safety and incomplete behavior

Cancellation, document ownership, CSP/mixed-content gates and CORS response checks
still apply. Supplying a mock does not grant page code access to its contents.
Unmatched requests remain subject to the existing transport's URL, DNS/address,
TLS, cookie and resource policies. Matched responses perform no DNS or outbound IO.

**The Node adapter now checks routes inside its native redirect loop.** Its
optional `NetworkTransport.requestWithRoutes(request, resolveRoute)` operation
consults the session's rules before DNS or exchange for each hop. Request and URL
validation, redirect limits, method/body rewriting, cookie recomputation,
credential stripping and the shared deadline remain in the existing driver.
Mocked bodies also consume its response/cumulative byte budgets. A monotonic
deadline check covers synchronous routing work, not only timer-driven awaits.

Other adapters without this operation still fail closed: with active rules the
session requests manual redirects and returns `unsupported` on a redirect with
Location, including an initially mocked redirect during navigation. They cannot
silently send a later request that should have been mocked or commit the redirect
body as the destination document.
Session `metrics.routes.automaticRedirects` identifies the selected adapter's
support; global capabilities describe it as adapter-dependent. Page fetch's own
manual redirect loop continues checking routes on every hop with its CORS policy.

The optional resolver is trusted host code, synchronous, and receives only URL,
method and the operation's abort signal, not credential headers or request body.
Invalid providers/responses fail closed rather than falling through to the wire.
It is not a facility for running guest JavaScript or unbounded async route handlers.
The elapsed-time check rejects overdue results after a custom resolver returns;
it cannot preempt arbitrary trusted host code. The session's own pattern matcher
has the separate finite work budget described above.

Responses are UTF-8 text with status 200–599. HEAD returns no body; nonempty bodies
with 204/205/304 are rejected. Explicit content type overrides a supplied
Content-Type header. A single Location header supports relative or absolute
redirect targets. Duplicate case-insensitive Location declarations are rejected
atomically, including mixed JSON/repeated CLI header options. The native driver
and page-fetch loop resolve and validate each target when requested; registering
a rule does not grant permission to follow an unsafe target. Manual/error modes
and redirect limits remain enforced. Page JavaScript receives a filtered
`opaqueredirect` response in manual mode, not the raw host response.

Set-Cookie/Set-Cookie2, Content-Encoding,
Content-Length, Transfer-Encoding, Connection and Trailer response headers are
currently rejected. Cookie effects, compression, binary/file
bodies, arbitrary handlers, request rewriting/removal, abort/delay rules,
service-worker interception and full upstream pattern/output parity remain open.

Explicit route mocks are not the repository-wide dry-run implementation. That
separate requirement still needs its own complete mutation/retrieval audit.

## Verification

`reports/redirect-mocking-focused-2026-09-02.json` records 290 passing tests across
fourteen files, including twenty-four native-driver cases. Added coverage includes
entirely mocked redirect chains, POST rewriting, manual/error handling, loop
limits, unsafe destinations, atomic Location validation and safe adapter fallback.
`reports/redirect-mocking-safejs-fixture-2026-09-02.json` records twenty-four passing
checks against the existing experimental SafeJS core, including entirely mocked
cross-origin redirects, per-hop journal/CORS results and guest manual/error modes.
All transport/DNS/exchange here is in-memory or mocked; these are not live-site,
HTTP/TLS, terminal, deployed-playground or published-SDK acceptance results.

`reports/native-routing-focused-2026-09-02.json` records 284 passing tests across
fourteen files. Twenty-one cases in `src/node-route-transport.test.ts` exercise the
actual native request/redirect driver with **mocked resolver and wire exchange**:
interception before target DNS, method/body transitions, cookie/header handling,
URL and address rejection, limits, response ownership, timeout/close, and real
session HTML loading. A memory stream runs through the real body-consumption
pipeline to check shared byte accounting. No server, socket, actual DNS lookup or
public request is performed. This does not replace the outstanding live HTTP/TLS
and website regression gates.

`reports/routing-focused-2026-09-02.json` records 263 passing tests across thirteen
files: glob semantics and a bounded oracle, atomic retention, delivery bounds,
copies, cancellation, session isolation, actual HTML/stylesheet parsing, command
registration/removal, journal/Network rendering, and fallback-adapter redirects.

`reports/routing-safejs-fixture-2026-09-02.json` records twenty passing checks using
the existing experimental SafeJS core. Interpreted fetch consumes routed JSON,
updates the document, checks CORS, follows a manual redirect into a route, and
restores ordinary transport behavior after removal. This is not verification of
the newly released SDK, live websites, a real terminal, a separate CLI process or
deployed playground behavior. Previously denied live gates remain unperformed.
