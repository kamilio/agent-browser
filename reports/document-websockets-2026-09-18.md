# Document-owned WebSockets — September 18, 2026

## Delivered

Opt-in `BrowserSessionOptions.webSocketTransport` creates a host-side
`session.page(tabId).webSockets` owner after navigation. The portable session
does not construct a native adapter or connect automatically. The existing Node
WebSocket subpath exports the owner and shared types. Text and binary native
framing are exercised over in-memory streams, not real sockets.

Admission preserves original document origin, resolves the current base URL,
rejects credentials/fragments/mixed content and applies bounded connect/default
CSP. Metadata fails closed. HTTP(S) self/source aliases are conservatively not
mapped to WS(S); this is not full CSP conformance.

Four concurrent resources, sixteen lifetime attempts and a fifteen-second
handshake deadline are the defaults. Cancellation rejects promptly but retains
dispatched resource slots until settlement and returned connection closure.
Late connections are aborted, asynchronous cleanup rejection is observed, and
navigation replacement/tab/session close cancel ownership. Fragment navigation
and failed navigation preserve the existing document's sockets. Missing or throwing
completion inspection cannot silently release a resource-bearing result: abort is
requested at most once and uncertain resources remain quarantined against capacity.

## Validation

- Final isolated native: **1,287 passed, 0 failed in 17 files**, including
  **213 new cases** in four files. Native network guard remains enabled.
- Build, selected-test types and formatting exit 0. Lint exits 1 for exactly
  one unchanged `noControlCharactersInRegex` finding in the shared CSP parser.
  Baseline and candidate JSON diagnostics match, including highlighted source.
  No suppression, unrelated regex rewrite or full-lint-green claim.
- Preserve core01: its native checks passed, but new-test typing and four new
  lint findings failed. Those issues are corrected in core02. A further review
  finds two malformed-adapter cleanup paths; eight additional cases qualify
  idempotent abort and quarantined resource accounting in final core03.
- All recorded validation processes/groups are absent; native HOME/TMP are empty.
- Verified **1673 source / 2480 compiled pins**.
  Explicit native manifest: 1047 entries, 22 pre-existing absent paths.

Runtime: `/tmp/agent-browser-document-websocket-9kDnFS/candidate`.
Evidence: `node_modules/.cache/native-validation/document-websocket-september18`.
Evidence retains all three runs, baseline diagnostics and the pre-follow-up
report as report-core02.md/JSON.

## Outstanding

This is **not a page JavaScript WebSocket global or a native Zoom join**. The
public SDK constructor, binary bridge, event scheduling and the previously failed
callback/source contract remain unverified. No SafeJS retry or internal patch.
No live website/socket/device/credential probe, audio, transcript or delivery.
The HTTP journal does not yet include these WebSocket connections. Custom adapter
cancellation is cooperative; cancellation metrics are not hostile containment or
proof that arbitrary external resources closed. See `DOCUMENT-WEBSOCKETS.md`.
The overall browser/Zoom outcome stays open. No default switch or push.
