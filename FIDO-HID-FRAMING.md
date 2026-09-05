# Native FIDO HID framing foundation

This implements a bounded, builtin-only wire codec and single-message assembler
as prerequisites for an eventual external authenticator transport. It does not
open devices, implement CTAP2, activate a passkey provider, or replace actual
hardware with software credentials. The complete passkey/browser goal stays open.

## Packet interface

`src/fido-hid-packets.ts` provides internal host-side functions:

- `fidoHidMaximumPayload(reportBytes = 64)` validates the explicitly supported
  integer range 7–64 and computes `(reportBytes - 7) + 128 * (reportBytes - 5)`.
  The 64-byte profile permits 7,609 payload bytes in at most 129 reports. These
  supported sizes are local bounds, not discovery of a device's descriptors.
- `copyFidoHidChannel(channel)` snapshots exactly four opaque bytes and rejects
  the reserved zero channel. Bytes are not interpreted as a numeric CID with an
  assumed endianness. Broadcast is structurally representable, not proof that a
  channel was allocated or that a command is permitted.
- `encodeFidoHidMessage(channel, command, payload, reportBytes = 64)` emits owned,
  fixed-size reports. The initial packet carries the command's high marker bit
  and a two-byte high/low payload length; continuation sequence numbers start at
  zero and cannot exceed 127. Empty payloads still produce one initial packet.
  Unused output bytes are zero. The command is an uninterpreted integer 0–127;
  valid framing does not validate or authorize U2F/CTAP/vendor command semantics.
- `decodeFidoHidPacket(report, reportBytes = 64)` returns an initialization or
  continuation record with independent channel/data copies. Packet data includes
  the whole data area, including padding. The stateless decoder exposes the full
  16-bit declared length; the message assembler enforces the negotiated ceiling.

Genuine intrinsic Uint8Array views are accepted, including Buffer and cross-realm
views. Borrowed intrinsic metadata avoids overridden getters, iterators, species
and byte-view properties. Non-byte, proxy, shared-backed and detached inputs fail
with fixed errors. Excessive payload lengths are rejected before copying payload
data. Global host intrinsic replacement is not a supported security boundary.
There are no production Node-only imports or new dependencies in this codec.

## Owned response assembly

`src/fido-hid-message.ts` exports `FidoHidMessageAssembler(channel, reportBytes)`:

- `accept(report)` returns undefined while incomplete or when a valid packet
  belongs to another channel. Foreign packets cannot modify the owned assembly.
- Own-channel continuation before initialization, duplicate/missing/out-of-order
  sequence numbers, a second initialization while pending, and malformed reports
  terminate the assembler with a fixed error. Any malformed packet terminates,
  including a malformed foreign packet. This strict host component is not an
  implementation of a device receiver's entire error/ignore policy.
- The declared payload is bounded before allocation. Only declared bytes are
  assembled; final padding is ignored even when nonzero. No partial message is
  returned. A completed record contains owned channel and payload arrays.
- Completion, failure and `close()` are terminal. `close()` is idempotent and
  overwrites any owned unfinished payload before discarding it. Completed payload
  ownership transfers to the caller and later close does not erase it. This is
  not a guarantee of erasing all source, temporary or runtime-managed copies.

The caller must supply endpoint/report sizes independently for each direction.
No OS report-ID prefix is added or removed. There is no device descriptor parser,
USB/HID enumeration, driver, polling loop, channel pool, nonce/INIT handshake,
transaction lock, deadline/read budget, automatic retry, resynchronization or
cancellation command. Ignoring valid foreign traffic does not provide a timeout.
These modules are internal prerequisites, not a public device-access capability.

## Source and verification

A fresh, separately authorized native-browser read retrieved the explicitly
versioned FIDO U2F HID 1.2 protocol source on **September 5, 2026 at 13:32:34.610
UTC**. HTTP 200, one real request, no redirects, exit 0 and closed transport;
the result remains `partial:true`, `contentSuccess:null`, `extracted-unverified`.
The source URL names the April 11, 2017 version, not a latest-spec assertion:
`https://fidoalliance.org/specs/fido-u2f-v1.2-ps-20170411/fido-u2f-hid-protocol-v1.2-ps-20170411.html`.

Evidence root: `node_modules/.cache/native-validation/fido-hid-framing/`.
`research/01-hid.extraction.md` sections 2.3–2.4 establish the channel and packet
layout; section 3 describes descriptor-dependent report sizes. The extracted
source does not establish numeric CID byte order, so the implementation preserves
opaque bytes. `research/verification.json` records exact receipt/body digests;
the transport-decoded body is 47,470 bytes, SHA-256
`c02c70b8251080cbb56abfce350e4684ce64b871018b7f24e470b95cadd433bc`.

A separate versioned CTAP2 request at **13:35:57.396 UTC** retrieved HTTP 200
but failed native extraction with `resource-limit`, exit 1. Its captured body is
332,248 bytes, but raw bytes were not substituted for successful native research.
No retry, alternate endpoint or raised limit followed. `research/ctap2/report.md`
preserves the failed comparison; modern CTAP2 equivalence remains unverified.

The clean snapshot on base `4cd272e` passes **78 new native cases** across exactly
two manifest-listed files: packet codec 17, assembler 61, zero failures/skips/todo.
Independent wire fixtures cover header bytes, sequence/payload boundaries, report
sizes, padding, malformed views, aliases, foreign channels and terminal behavior.
The tests also loop over multiple sizes/lengths; those internal iterations are not
inflated into extra test counts. Build, strict new-test types and four-file Biome
pass. Initial formatting/number-namespace diagnostics remain in the evidence.

Two workers disconnected after writing their files; the parent inspected and
completed their changes locally. The recorded native run is authoritative, not a
worker success claim. The native scope uses synthetic bytes and a Node test realm
for byte-brand checks, not page execution or a SafeJS probe. No actual device,
credential, private key, PIN, touch, UV, trusted consent, live relying party or
hardware cancellation behavior was exercised. Previously denied and stopped
acceptance gates remain unchanged.

Next requirements are qualified CTAP2 framing/command semantics, report-descriptor
and OS I/O contracts, channel/nonce ownership and bounded cancellation, then an
explicitly authorized hardware provider with trusted human consent/PIN/UV and
real relying-party acceptance. Framing tests alone satisfy none of those gates.
