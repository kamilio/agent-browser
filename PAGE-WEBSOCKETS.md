# Page JavaScript WebSockets

The standalone browser has an opt-in, bounded `WebSocket` page bridge backed by
the document-owned native transport. It does not use Chromium, Firefox or a
remote browser. No new dependency or implicit network adapter is added.

## Activation and ownership

Configure `BrowserSessionOptions.webSocketTransport` as described in
`DOCUMENT-WEBSOCKETS.md`. The session binds its owner before document parser and
script hooks run. `PageScripts` then supplies the static guest bootstrap through
the extension runtime's `initializationSource` and publishes the constructor as
both `WebSocket` and `window.WebSocket`.

For an application-owned `DocumentTree`, call `bindDocumentWebSockets` from
`agent-browser/node-websocket` before constructing `PageScripts`. Supply the
authoritative response CSP headers; do not drop them to enable a connection.
Repeated binding accepts only the same transport and equivalent snapshotted
configuration. The registry never creates an owner merely on lookup.

Without an owner, the page global is absent and existing startup is unchanged.
The legacy runtime rejects bootstrap initialization rather than pretending it
installed the constructor. This change does not select or install a default SDK.

## Supported partial profile

- Guest-owned constructor and readonly constants; shared global/Window identity.
- Synchronous URL/protocol admission under origin, mixed-content and response-CSP
  policy before any transport effect. Relative URLs use the current document base.
- Readonly URL, protocol, state, extensions and buffered amount; copied string,
  ArrayBuffer and typed-array sends with bounded, ordered write accounting.
- Text messages and copied binary messages when `binaryType = "arraybuffer"`.
- Function listeners, property handlers, once/removal/deduplication, receiver and
  event target identity. Listener objects and unsupported options are rejected.
- Close validation, connecting cancellation, late connection cleanup, and
  document/realm cancellation without post-close callbacks.
- Cancellable network tasks for open/message/error/close delivery. Native promise
  completion does not itself publish OPEN/CLOSED during interpreter microtasks.

The bootstrap port is one-shot and retained only inside the guest closure. Socket
instances expose neither that authority nor the raw transport connection. Guest
references use the public runtime interface and are released during cleanup.

## Bounds and lifecycle

`PageBindingOptions.webSocketLimits` bounds socket objects, listeners, events,
callbacks, copied bytes and sends. Defaults are 32 socket objects, 128 listeners,
4,096 retained events, 8,192 callbacks, 128 pending callbacks, 4 MiB per message,
8 MiB retained bytes, 128 pending sends and 4,096 lifetime sends. The document
owner's separate defaults of four concurrent/sixteen lifetime connections still
apply and are usually tighter. Pending network tasks are bounded by socket count
and canceled at shutdown. Queued event bytes count before their task runs.

Delivered events retain their data until controller closure so saved event
objects remain readable. A long session can exhaust this finite budget; this is
not evidence of long-meeting readiness. The controller closes its connections,
not an application-owned shared document owner or unrelated host connections.

## Validation on September 18, 2026

Selected native tests pass **1,510/1,510 across 23 files**; build, type checking,
format and lint pass for the qualified candidate. This is not a full-suite pass.

Two explicitly approved isolated runs used pinned public SafeJS **0.1.640** and
an in-memory transport. The first passed nine checks, then failed the immediate
CLOSING-state assertion. Browser-side cancellable network tasks fixed that race;
the fixture and SDK were unchanged. The second passed all **15 checks**, including
typed arrays, constructor identity, listener ordering and cleanup. Both guard
stages passed; all child processes/groups were reaped and input pins unchanged.
See `reports/page-websockets-2026-09-18.md` and its JSON companion for original
paths, failures, final measurements and the approved scope.

Final review then fixed two accounting edge cases: writes accepted before a
terminal task and reservations for suppressed open events. Two additional native
regressions pass. Those follow-ups have not been rerun against the actual SDK;
the 15-check SDK result belongs to the preceding core03 candidate. Both approved
SDK attempts are consumed, and their original evidence is preserved.

## Remaining gaps

The default `binaryType` is `"blob"`, but Blob receive is deliberately unsupported
and fails closed. There is no Blob send, full Event/WebSocket platform conformance,
cookie/authenticated handshake, HTTP request-journal integration or implicit CLI
enablement. Callback/source overlap with a pending async tail remains a separate
failed SafeJS core gate; this narrow profile does not retry or supersede it.

No website or real socket was exercised by these checks. Zoom authentication,
admission and signaling compatibility, WebRTC, codecs, incoming audio, speaker
tracking, capture, transcription, summary and delivery are not established.
No meeting was joined, no participant audio recorded and no credential/device
access performed. A live notetaker still needs those layers and end-to-end checks.
