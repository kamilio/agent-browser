# Agent network diagnostics

Status: September 2, 2026. `requests` and `request <index>` now read bounded,
redacted metadata from the package's own transport calls. The playground has a
Network pane using the same API. This is partial diagnostics, not full Playwright
CLI or Kitesurf Network parity. No dependency or browser-engine change is involved.

The later `PAGE-FETCH.md` addition also captures document-owned page fetch calls.
Its manually followed redirect hops appear as separate `fetch` entries.
`PAGE-CORS.md` additionally records permission probes as `preflight`. HTTP
completion in this journal does not imply guest CORS access to the response;
the separate `cors` field now records the hop's CORS permission check, including
an HTTP-successful preflight that rejects the later application request.

## Commands and scope

```bash
node packages/browser-agent/dist/src/cli.js -s=research requests --json
node packages/browser-agent/dist/src/cli.js -s=research request 0 --json
```

These commands inspect an already open session. They never fetch a URL, replay a
request, consume snapshot diffs or enable page JavaScript. Detail indices are
zero-based integers; missing or evicted entries return `not-found`. Decimal syntax
is required by the command API. All commands are serialized per named session, so
CLI reads do not stream while a navigation command is running. The direct
`BrowserSession.requests(tabId)` SDK can inspect a pending request.

Each tab owns the journal of its **latest network navigation attempt**, not a
session-wide archive and not necessarily the displayed page's successful load.
A new cross-document network attempt clears the old journal and increments
`navigation`. Fragment/same-document navigation retains it. Invalid initial URLs
rejected before navigation and resources skipped before a fetch callback are not
invented as network events. Empty tabs return an empty journal with navigation 0.

`document` identifies the document committed by this attempt, or `null` until a
commit. `displayedDocument` identifies the currently displayed document. A failed
navigation or HTTP 204/205 can leave the previous page displayed while the new
attempt has `document: null`. Reads include `scope: "latest-network-navigation"`,
`tabId`, `navigation`, and `partial: true`. Indices are not stable across attempts;
compare the tab/navigation pair when retaining a detail reference.

## Captured metadata

`ROUTING.md` adds `routeId` for requests fulfilled from a session-owned rule.
Direct mock responses have zero wire bytes and decoded size describes the
replacement body. A native redirect chain ending in a mock retains its preceding
redirect metadata and can include earlier wire bytes; `routeId` identifies its
final fulfillment, not every hop. The playground identifies the mock route; no
rule body or header is copied into the journal.

- Initial document requests, script/stylesheet callbacks and page fetch ports, including
  callback-level mixed-content policy failures. No headers or bodies are retained.
- Kind, method, sanitized initial/final URLs, pending/complete/failed/blocked state,
  status, encoded/decoded response byte counts and elapsed host-observed duration.
- Transport-followed redirect count and at most eight sanitized redirect records.
  More redirects set `redirectsTruncated`; those redirects do not get separate
  indices. Page fetch's manual redirect hops instead appear as separate entries.
- Stable error codes only, never transport exception messages. HTTP error status
  responses are `complete`, not fabricated network failures. Pending elapsed time
  is zero until settlement; this is not a TTFB/timing-waterfall implementation.

For page-fetch hops requiring CORS, `cors` has one of these values:

| Value | Meaning |
| --- | --- |
| `pending` | The request is observed but its CORS check has not settled. |
| `allowed` | This hop's response or preflight permission check passed. |
| `blocked` | This hop's response or preflight permission check rejected it. |
| `not-checked` | Transport, cancellation, response validation or another earlier failure prevented the CORS check. |

The field is absent for same-origin hops and requests without an attached CORS
observer. `allowed` does not imply successful HTTP status, a readable final
response, successful body consumption or completion of the entire fetch. For
example, an allowed preflight and blocked actual response have separate records;
a blocked preflight has no fabricated record for the application request that
was never sent. The playground displays this decision alongside HTTP status.

`PageFetchRequestContext.observeCorsResult` is a trusted transport-context hook,
not an accepted guest fetch option. Results are one-shot, fixed enums, associated
with the exact request rather than its URL. No CORS headers, exception messages
or body data are added. Diagnostic observer failure cannot override fetch policy.

Default ceilings per tab are 128 entries and 262,144 UTF-8 bytes of serialized
**entry payloads**. Oldest entries are evicted; `dropped` counts lost records.
`retainedBytes` excludes the response wrapper and JSON array separators; it is not
a process heap/RSS measurement. Completion can expand an entry and trigger eviction.
CORS decisions also count against entry payload bytes and can trigger eviction.
Late completion or decisions cannot reinsert evicted, replaced or closed entries.
Closing a tab/session clears retention. Aborted transport waits are recorded
without waiting for a non-cooperative adapter to settle.

Returned snapshots/details are detached copies. The portable `NetworkJournal`
class also permits smaller retention limits; the session uses the fixed defaults.
No network policy is relaxed, and diagnostics do not retry or change responses.

## Sensitive data and limitations

Credentials, full query strings and fragments are omitted from diagnostic URLs;
queries become `?redacted`. URLs are capped at 2,048 code units with an explicit
truncation suffix. Invalid/non-HTTP(S) URLs become `[unavailable]`. Redirect
locations resolve against their source URL before the same redaction.

**Paths and hostnames can still contain sensitive data.** This is not a general
secret scrubber. Do not publish diagnostics blindly. This policy applies only to
the journal, not every other command response or document URL in the package.

`IMAGE-RESOURCES.md` now adds actual `image` request records through the session
transport, including validated redirect chains. HTTP success and image decode
success are separate; inspect `images` for resource-format/state failures.

Full fetch/CORS/XHR, WebSockets, service workers, cache events, detailed wire
timings, headers/bodies, HAR export, filtering, routing and interception are not
implemented by this feature. A parser-skipped script is not shown as a request.
Playground inspection is inert text; its command field provides `request <index>`
details. There is no row-click detail drawer, waterfall or new live UI acceptance.

## Evidence

`reports/cors-journal-focused-2026-09-02.json` records 228 passing tests across
twelve files. New coverage separates CORS denial from HTTP success, checks
preflight/actual/redirect decisions, cancellation, failed observers, guest option
rejection, exact request identity, byte bounds and late results after eviction
or close. Session wiring and playground text rendering are included.

`reports/cors-journal-safejs-fixture-2026-09-02.json` records sixteen checks using
the existing experimental SafeJS core and an in-memory transport. Interpreted
fetches change the DOM and the real session records allowed preflight/actual
decisions plus an HTTP 204 preflight blocked by CORS. This is not verification of
the newer published SDK or live multi-origin network behavior.

`reports/network-journal-focused-2026-09-02.json` records the focused journal,
session, command/parser, playground formatter and mock process-host tests. Cases
cover redaction, retention, redirects, copies, aborts, tab isolation, supersession,
same-document retention, failed/no-content attempts, and the real HTML loader's
stylesheet callbacks against an **in-memory fake transport**.

No new public-site, PTY, server, subprocess or visual browser probe is claimed.
The previously denied terminal/site gate remains unverified. This checkpoint does
not replace existing real-site evidence or establish wider website compatibility.
