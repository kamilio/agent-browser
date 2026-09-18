# Document-owned native WebSockets

`BrowserSessionOptions.webSocketTransport` opts a host application into native
WebSocket connections. The portable session never constructs a network adapter.
After navigation, `session.page(tabId).webSockets` owns that document's connections.
Without an adapter, that property is absent and nothing connects automatically.

```ts
import { BrowserSession } from "agent-browser";
import { NodeWebSocketTransport } from "agent-browser/node-websocket";

const session = new BrowserSession({
  createTransport,
  loadDocument,
  webSocketTransport: new NodeWebSocketTransport(),
});
const tab = session.createTab().id;
await session.navigate(tab, "https://example.com/");
const connection = await session.page(tab).webSockets!.connect("/events", {
  protocols: ["events.v1"],
  signal,
});
await connection.send("subscribe");
const message = await connection.read();
await connection.close();
```

The example needs application-owned HTTP transport, document loader and signal.
It is an API illustration, not a live endpoint or a successful network probe.
The Node subpath also exports `DocumentWebSockets` and its configuration types
for applications owning a `DocumentTree` directly.

## Policy and ownership

- The document's original HTTP(S) origin supplies the handshake Origin; relative
  URLs use its current base URL. HTTP(S) targets normalize to WS(S); URL
  credentials/fragments are rejected and HTTPS owners require WSS.
- Response CSP `connect-src` and `default-src` apply before transport dispatch.
  Observed meta CSP fails closed; unsupported metadata is not ignored or removed
  to gain access. DNS/address restrictions and TLS stay in the native transport.
  This bounded policy does not map an HTTP(S) owner's `'self'`, implicit host
  schemes or HTTP(S) source expressions to WS(S). Explicit matching `ws:`/`wss:`
  sources are supported; this conservative subset is not full CSP conformance.
- Limits default to four simultaneous connections, sixteen lifetime attempts and
  a fifteen-second handshake deadline per document. Native frame, message, write
  queue and lifetime byte bounds still apply separately.
- Caller cancellation and document close cancel pending and established sockets.
  Late results from an uncooperative adapter are aborted rather than published.
  Fragment navigation retains the document; replacement or tab/session close
  ends its ownership. Failed navigation does not close the old document's sockets.
- Handshake timeouts reject the caller even if a custom adapter ignores its
  signal. `close()` requests cancellation; it is not a proof that an arbitrary
  custom adapter has released external resources. Metrics include cleanup errors.
  Canceled, dispatched work retains its concurrency slot until its connection
  attempt settles and any returned connection closes. Uncooperative adapters do
  not receive additional slots merely because their caller stopped waiting.
  A malformed resource-bearing result without an observable `closed` promise
  remains quarantined and consumes a slot, even if its abort method returns.
  The `quarantined` metric is a subset of `closing`, not proof of cleanup.

## Explicit limitations

This is a **host-side document API**, not a page JavaScript `WebSocket` global.
Public SafeJS construction, binary conversion, event delivery and scheduling
still require their own bridge and real-SDK validation. The existing callback
reentry compatibility failure is not relaxed or hidden by this addition.

No cookie/credential handshake, page event constructor, Blob bridge, WebRTC,
audio decoder, Zoom admission, capture, transcription or delivery is implemented
here. Connections are not yet represented in the HTTP request journal. No CLI
flag enables them implicitly. Native tests use explicit in-memory adapters only;
they do not establish website, real socket, device, credential or SDK acceptance.
