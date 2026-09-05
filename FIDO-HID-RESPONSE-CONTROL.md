# Pure FIDO HID response-control decoding

`src/fido-hid-response-control.ts` decodes assembled KEEPALIVE and ERROR messages
for an allocated-channel caller. It is an internal, builtin-only transport helper,
not a device driver, transaction controller or usable hardware passkey provider.
No dependency, package export or page runtime is added.

## Contract

`decodeFidoHidResponseControl(channel, command, payload)` requires a genuine
four-byte, nonzero, non-broadcast CID and exactly one payload byte. Commands are
normalized `0x3b` (KEEPALIVE) or `0x3f` (ERROR); wire bytes `0xbb`/`0xbf`, CANCEL,
CBOR and other commands are not accepted or silently masked. Empty/trailing
payloads reject. INIT's extension-byte policy does not apply to these layouts.

The result is either `{ kind: "keepalive", channel, code, status }` or
`{ kind: "error", channel, code, error }`. Its channel is an independent owned
four-byte copy. `code` preserves the original unsigned payload byte. Known labels:

| Kind | Code | Label |
| --- | --- | --- |
| KEEPALIVE | `0x01` | `STATUS_PROCESSING` |
| KEEPALIVE | `0x02` | `STATUS_UPNEEDED` |
| ERROR | `0x01` | `ERR_INVALID_CMD` |
| ERROR | `0x02` | `ERR_INVALID_PAR` |
| ERROR | `0x03` | `ERR_INVALID_LEN` |
| ERROR | `0x04` | `ERR_INVALID_SEQ` |
| ERROR | `0x05` | `ERR_MSG_TIMEOUT` |
| ERROR | `0x06` | `ERR_CHANNEL_BUSY` |
| ERROR | `0x0a` | `ERR_LOCK_REQUIRED` |
| ERROR | `0x0b` | `ERR_INVALID_CHANNEL` |
| ERROR | `0x7f` | `ERR_OTHER` |

Every other one-byte value returns the kind-specific label `"unknown"`, not a
guessed known condition. Unknown ERROR is distinct from `ERR_OTHER`. Transport
errors return data; malformed local inputs throw a fixed `invalid-input` error
without echoing input or hostile exception messages.

Intrinsic byte-view validation accepts ordinary-buffer Uint8Array/Buffer,
subclass and cross-realm offset views without consulting shadowed getters or
species. Wrong brands, lookalikes, proxies, detached buffers and shared storage
reject. Inputs are neither modified nor retained. No allocation proportional to
an attacker-supplied payload length is needed.

## Evidence and policy boundary

The source is the January 30, 2019 CTAP2 specification's USB HID section, read
through the native browser. The source-derived notes in
`node_modules/.cache/native-validation/fido-hid-response-control/SOURCE.md` retain
the earlier September 5, 2026 18:55:21.811 UTC response and exact saved paths.
The distinct heading-discovery workflow later retrieved matching section bytes
at 23:00:34.562 UTC. That fresh retrieval does not relabel the older receipt or
make this a latest-specification claim; `HEADING-DISCOVERY.md` keeps both request
boundaries and hashes. No new request is needed for this helper increment.

The historical source gives command/layout/code definitions. The strict
allocated-channel API, result shape, unknown-value preservation and fixed local
errors are engineering policies. Rejecting broadcast here does not assert that
every possible protocol ERROR on broadcast is forbidden. A valid CID does not
prove caller ownership, allocation, device authenticity or request association.

KEEPALIVE is informational and does not finish a transaction. `STATUS_UPNEEDED`
means waiting, not presence obtained, verification, PIN approval or consent.
Each complete message exhausts the existing one-message assembler; another
KEEPALIVE or final response needs a fresh assembler managed by a future owner.
Historical emission guidance is not implemented as a host deadline/reset policy.
CANCEL has no separate acknowledgement here: its eventual CBOR response and
CTAP2 status handling remain outside this helper. No terminal, cancelled,
retryable or authorization flag is inferred.

## Remaining passkey gates

Physical transport and permissions, descriptor/report-ID discovery, trusted
metadata, channel/transaction ownership, bounded read/write queues and deadlines,
disconnect/error/cancellation races, CBOR requests/responses and trusted human
PIN/UV/consent remain open. These pure bytes do not activate any provider or
satisfy real credential/device, SDK, socket/TTY or website acceptance gates.

## Scoped validation

The clean candidate on base `8b21598` passes the exact five-file native scope:
**260 tests, zero failures or skips**, including 35 new response-control cases.
The other suites cover report-byte normalization, allocation, packets and message
assembly. Build, strict typing of the new suite and two-file Biome checks pass.

The new cases exercise eleven known labels, all 501 unknown kind/code pairs and
all 254 unsupported command bytes in explicitly counted loops; these are assertions
within 35 test cases, not 501 additional reported tests. Negative cases cover
coercion, byte brands/storage, proxies, hostile hooks, lengths and reserved CIDs.
Ownership/mutation checks and successive controls at 7/8/64-byte reports use exact
nonempty packet counts and a fresh assembler per message. This does not simulate
or prove a physical transaction controller, cancellation or user verification.

Independent bounded static review found no concrete defects and records the
exact implementation/test hashes. Its conclusion is separate from executed tests
and does not independently verify the specification derivation or actual hardware.

Evidence is retained under
`node_modules/.cache/native-validation/fido-hid-response-control/`. The scoped pass
does not supersede unrelated baseline failures or denied full-manifest/SDK probes.
