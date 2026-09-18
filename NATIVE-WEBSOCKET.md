# Native host WebSocket transport

`agent-browser/node-websocket` provides a Node-host transport without a new
runtime dependency or a Chromium, Firefox, or remote-browser fallback. It is
not yet the page's `WebSocket` global and does not make Zoom participation work.

## Host API

```ts
import { NodeWebSocketTransport } from "agent-browser/node-websocket";

const transport = new NodeWebSocketTransport({
	allowedOrigins: ["wss://realtime.example"],
	limits: { maxPendingWrites: 32 },
});

try {
	const connection = await transport.connect("wss://realtime.example/events", {
		origin: "https://app.example",
		protocols: ["events"],
	});
	await connection.send("subscribe");
	const message = await connection.read();
	if (message) console.log(message.data);
	await connection.close(1000, "done");
} finally {
	await transport.close();
}
```

This illustrative example needs an actual authorized server implementing the
application protocol; it is not a live-validation recipe or a Zoom endpoint.
The origin is trusted host input, not a page-authenticated security context.

- `connect(url, { origin, protocols?, signal? })` returns a connection with
  canonical `url`, negotiated `protocol`, `state`, and a `closed` promise.
- `send(string | Uint8Array)` owns its input, masks client frames with fresh
  random keys, fragments large messages, and resolves after write callbacks.
  It does not establish remote application receipt.
- `read()` returns the next `{ data }` text/binary message, returns `undefined`
  after orderly closure and draining queued messages, or rejects on failure.
  Only one read may be pending. Ping/pong frames are handled internally.
- `close(code?, reason?)` performs a bounded closing handshake; caller codes
  are 1000 or 3000–4999 and the reason is at most 123 UTF-8 bytes.
- `abort(error?)` destroys the connection. `closed` resolves with
  `{ code, reason, wasClean }`; inspect `wasClean` rather than treating promise
  resolution as successful protocol completion.
- Connection and transport `metrics()` return frozen counter snapshots.
  `transport.close()` stops new connections and settles pending/active work.

## Bounds and policy

All limits must be positive safe integers. Defaults are 1 MiB per frame,
4 MiB per message, 4096 frames per received push or sent message, 128 unread
messages, 8 MiB unread payload, 128 pending write tasks, 8 MiB pending encoded
writes, and 64 MiB received/sent wire bytes per connection. Byte limits alone
do not bound tiny-message task overhead, so the write-task count is separate.
The fragmented-message assembly buffer grows geometrically to its byte cap.

Handshake/write deadlines default to 15 seconds; closing defaults to 2 seconds.
The transport permits 4 concurrent connections/handshakes and 16 connection
attempts per instance. Header bytes are capped at 16 KiB. Header extraction
does not silently truncate by field count before validation.

Existing network policy checks the target origin, port, literal address, and
every DNS result before using a pinned numeric address. TLS preserves the
original hostname for SNI and certificate identity checks. An HTTPS document
origin cannot connect to insecure `ws:`. Private origins require explicit
host configuration. An optional host-owned resolver supports deterministic
tests; it is not exposed to page code.

Handshake validation requires HTTP 101, a valid Upgrade/Connection pair and
the exact accept digest. Unoffered or duplicate selected subprotocols and any
extension negotiation are rejected. Server frames must be unmasked with no
reserved bits; message fragmentation, strict UTF-8, control frames, close
codes, and aggregate limits are validated. The transport offers no redirects,
retries, compression, cookies, authorization headers, proxies, or arbitrary
custom headers. It identifies itself as `AgentBrowser/0.1`.

## Acceptance boundaries

Deterministic tests use in-memory Duplex streams, mocked HTTP(S) requests,
injected DNS results, and fake timers. These are not actual TCP/TLS, Node HTTP
parser, public-site, or Zoom interoperability evidence. Test reports preserve
those distinctions, including the installed Node source inspection supporting
the header-extraction fix.

Page event dispatch, SafeJS binary ownership/retention, document origin and
CSP integration, HTML module execution, and real socket acceptance remain
separate work. Zoom additionally needs native receive-media transport,
decode/PCM capture, meeting admission, durable recording, transcription,
summary and verified requested delivery. No meeting was joined and no audio
was captured by this implementation's qualification.
