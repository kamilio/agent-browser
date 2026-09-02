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
  decoded bytes count the replacement payload. Session `metrics.routes` reports
  fulfillment and retained/delivered bytes separately from real transport metrics.

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

**Automatic transport redirects are stopped while routes are active.** For
unmatched requests that would normally auto-follow, the session requests manual
redirects and returns `unsupported` on a redirect with Location. It does not let
the adapter silently send a later request that should have been mocked. Page
fetch already follows redirects hop by hop and therefore checks routes on each
hop; its existing CORS and redirect policies remain in force.

Responses are UTF-8 text with status 200–599. HEAD returns no body; nonempty bodies
with 204/205/304 are rejected. Explicit content type overrides a supplied
Content-Type header. Set-Cookie/Set-Cookie2, Location, Content-Encoding,
Content-Length, Transfer-Encoding, Connection and Trailer response headers are
currently rejected. Redirect mocking, cookie effects, compression, binary/file
bodies, arbitrary handlers, request rewriting/removal, abort/delay rules,
service-worker interception and full upstream pattern/output parity remain open.

Explicit route mocks are not the repository-wide dry-run implementation. That
separate requirement still needs its own complete mutation/retrieval audit.

## Verification

`reports/routing-focused-2026-09-02.json` records 263 passing tests across thirteen
files: glob semantics and a bounded oracle, atomic retention, delivery bounds,
copies, cancellation, session isolation, actual HTML/stylesheet parsing, command
registration/removal, journal/Network rendering, and fail-closed redirects.

`reports/routing-safejs-fixture-2026-09-02.json` records twenty passing checks using
the existing experimental SafeJS core. Interpreted fetch consumes routed JSON,
updates the document, checks CORS, follows a manual redirect into a route, and
restores ordinary transport behavior after removal. This is not verification of
the newly released SDK, live websites, a real terminal, a separate CLI process or
deployed playground behavior. Previously denied live gates remain unperformed.
