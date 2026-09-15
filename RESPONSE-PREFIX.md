# Failed decoded-response prefixes

The Node transport can retain a small diagnostic byte prefix when a compressed
response exceeds its decoded-body limit. This is **off by default** and is not a
successful or complete `NetworkResponse`.

```ts
import { NodeNetworkTransport } from "agent-browser/node";

const transport = new NodeNetworkTransport({ captureDecodedPrefixBytes: 65536 });
try {
	await transport.request({ url: "https://example.com/feed.xml" });
} catch (error) {
	const prefix = transport.responsePrefix(error);
	if (prefix) {
		console.error({ complete: prefix.complete, retainedBytes: prefix.body.byteLength });
	}
	throw error;
} finally {
	transport.close();
}
```

`captureDecodedPrefixBytes` must be a safe integer from 1 through 65,536. On a
genuine `network.response-decoded` overflow, retain exactly the first
`min(captureDecodedPrefixBytes, effective maxResponseBytes)` decoded bytes. The
effective response ceiling still respects narrower per-request limits. The
option neither raises limits nor changes the original rejection, request pacing,
byte accounting, response-cache admission or complete-response handling.

`responsePrefix(error)` recognizes only the exact failed response error owned by
that transport. It returns undefined for unrelated errors, another transport's
errors, and after `close()`. Each call returns a fresh byte-array copy; the
envelope, headers and header arrays are frozen. The result contains:

- `kind: "decoded-response-prefix-v1"` and `complete: false`.
- `url`, `status` and `headers` for the failing **response hop**, not a successful
  navigation, redirect history or proof that content was accessible.
- `body`: the bounded raw decoded prefix, not a parsed document or item.
- `encodedBytes` and `decodedBytes`: observed response-hop byte counts, including
  the chunk crossing the limit; these are not retained-prefix lengths.
- `limit`: the effective per-response byte ceiling that was exceeded.

Only decoded per-response overflow qualifies. Encoded-body limits (including
oversized identity responses), session/accounting limits, timeout, abort, close,
unsupported encoding and decompression failures do not produce a prefix. The
pipeline rejects and destroys its streams before capture is exposed. Interrupted
decompression does **not** verify a compressed trailer/checksum or the remaining
body. A byte prefix may end inside UTF-8, XML, HTML, an entity or an item.

Capture is a host-side diagnostic, not automatic agent-visible content. It can
include sensitive source bytes and headers; do not log it indiscriminately.
Sanitize URLs and select/redact headers before exporting research evidence. Do
not insert it into complete-body captures, generic replay, caches, document
loaders or success reports. A 200 status or an apparent item title in a prefix is
not proof of a complete feed, full article, successful access, or script support.
The research CLI does not enable this option or admit prefixes as full bodies.
Parser-safe partial content admission remains separate work.

Native-only coverage is in `src/node-response-prefix.test.ts` and the selected
network/accounting suites in `native-tests.json`. Live acceptance is separately
scoped and recorded; unit tests alone are not live-site validation.
