# Owned FIDO HID CBOR exchange lifecycle

`src/fido-hid-connection.ts` adds an internal `FidoHidCborConnection` over an
explicit normalized-report transport. It joins the existing packet, message and
response-control primitives into one asynchronous exchange lifecycle. It does
**not** open a device, allocate a channel, encode/decode CTAP CBOR, activate a
passkey provider or perform a browser ceremony.

The caller must supply an allocated CID and exclusive ownership of a trusted
transport adapter. A module-local WeakSet prevents a second connection from
claiming the same adapter object, including after closure. It cannot identify
two wrappers around the same handle or establish cross-process/device ownership.
CID bytes and descriptor metadata alone are not trust or consent capabilities.

## Transport contract

`FidoHidReportTransport` has `read()`, `write(report)` and `close()` promises.
Reads return one complete normalized HID packet; writes settle after consuming
the passed report and return its byte count. Input/output lengths are independently
7–64 bytes, default 64. These are **not** Linux hidraw's ID-prefixed write buffers.
An eventual OS adapter must apply the separately established report-ID convention
and preserve ordered, complete-report semantics. A successful write promise is
not proof that an authenticator accepted or processed the command.

Adapters are trusted host code, not sandboxed page callbacks. Their methods are
snapshotted during construction; exceptions are replaced with fixed errors. The
connection copies the CID and request before I/O, writes one report at a time,
and wipes each temporary write buffer only after that operation settles. Driver
code must not retain a write-buffer reference as a stable log or reuse it later.
Read input is copied by the framing/assembler boundary; driver-owned input is
not wiped. Returned response payload ownership transfers to the caller.

## Exchange and local ownership

`exchange(payload, options)` accepts a nonempty opaque CBOR-transport request and
sends command `0x10`. A concurrent exchange fails without disturbing the active
one. Admission is checked again after caller option access and request copying,
so a reentrant getter cannot overwrite another job or revive a closing connection.
No suffix write, uncertain retry, automatic INIT resynchronization or channel
reallocation occurs after an inexact write or transport/protocol failure.

All request reports finish before normal response reads start. Each completed
KEEPALIVE is decoded and followed by a fresh message assembler; it is not a
terminal response and never extends the deadline. `keepalive` exposes only a
fresh scalar status snapshot while active. Unknown status/error bytes retain
their numeric values and an unknown label. No status authorizes user presence,
PIN entry, UV or consent.

A matching nonempty command-`0x10` response returns `{kind: "response", payload}`
without interpreting its CTAP status or CBOR content. A matching HID ERROR returns
`{kind: "error", code, error}`. Unexpected commands, malformed sequencing/control
payloads and invalid report lengths quarantine the connection. Valid terminal
results can return the local lifecycle to idle; this is **not** a guarantee that
the remote device is idle, that its CID remains valid forever, or that a reported
error is retryable. The host must handle protocol results before another request.

Every input report, including a foreign-CID packet, consumes the report budget.
`maxReports` defaults to 4096 and accepts integers 1–16384. The default deadline
is 120,000 ms, configurable from 1–600,000 ms. Timer callbacks and monotonic checks
before I/O, after awaits and before terminal acceptance prevent a stream of
immediately fulfilled promises from accepting a late response solely because a
timer callback has not yet run. These bounds do not forcibly preempt synchronous
host code or establish hard real-time/OS interruption guarantees.

## Abort and closure

A pre-aborted native signal performs no I/O. Abort during request sending rejects
and quarantines without sending CANCEL or continuing the request. Once the whole
request has been sent, abort sends one empty command-`0x11` CANCEL, potentially
while a read is pending. There is no expected reply to CANCEL itself: the original
transaction's terminal response must still arrive.

Cancellation drains under the earlier of the original deadline and a chosen
1000-ms grace period. That grace is an engineering policy, not a standard-mandated
timing guarantee. Even after receiving a terminal response, the connection cannot
return to idle until the CANCEL write settles; a late CANCEL must not affect a
new exchange. Once cancellation is known, discarded terminal-response bytes are
wiped **before** waiting on that write. A fully drained abort still rejects with
`aborted`; it does not claim the opaque terminal payload confirms CTAP cancellation.

Timeout, protocol/I/O failure or explicit close stops further I/O and starts one
adapter close. `closing` remains visible until all captured pending read/write
operations **and** the close promise settle. A fulfilled close alone cannot claim
closure while an operation is still pending. Rejected close becomes `close-failed`,
not idle or closed, and is not retried. Hanging I/O can therefore leave closure
pending indefinitely even after the caller's exchange has rejected. Late
completions cannot revive the job. This is quarantine, not pretend cancellation.

Error categories use existing `invalid-input`, `not-actionable`, `resource-limit`,
`aborted`, `timeout`, `closed` and `unsupported`; the last covers this normalized
HID adapter's I/O/close failure policy, not a claim that it is a network transport.
Underlying exception text, abort reasons and request/response contents are not
included in errors. Idle/active/closing/closed/close-failed are local states.

## Evidence and validation

Historical native CTAP USB extraction informs ordered request/response exchange,
allocated CIDs, nonterminal KEEPALIVE and CANCEL's original-response semantics.
It is the January 30, 2019 proposed standard, not a latest-spec assertion. Its
preserved Markdown SHA256 is
`527902104d1b22278ddf0973f2e2b4fa0f66d832b692d69cd45671519e698d64`;
the September 5, 2026 23:00:34.562 UTC native receipt remains separately recorded
in `HEADING-DISCOVERY.md`. No source example was executed.

The separate Node `v22.22.0` find/lines receipts at **September 6, 2026 01:00:08.074
and 01:01:31.188 UTC** locate `O_NONBLOCK` at line 7914 and read lines 7845–7944.
Both are one-request HTTP-200, closed, partial/extracted-unverified, with matching
269,901-byte body hash
`2116e13854c19f91b41c07dc81b94093992fe0b33c42f56c00a0794e28fcc0db`.
The documentation qualifies nonblocking as conditional; it does not prove device
deadline or interruption behavior. Exact receipts, selected-source hash and the
35-file frozen ledger remain under
`node_modules/.cache/native-validation/node-open-flags-source/`. The earlier
Node/Linux lifetime limitations in `NATIVE-HIDRAW-IO.md` remain open.

On clean base `e3c5246`, the exact seven-file native scope passes **337 cases,
zero failures or skips**: 61 new unit cases, three new integration cases and 273
existing framing/control/allocation/descriptor cases. Integration uses scripted
wire bytes for descriptor metadata, nonce-correlated INIT and 64/64, 7/64, 64/7
input/output lengths with independent hidraw IDs. It is not real traffic, actual
CBOR validity, a relying-party assertion or a human-presence test.

Initial independent review found the admission race and cancelled-response
retention gap; both have targeted regressions. The initial 337-case pass remains
separate from final validation after test-only type/style corrections. Focused
dependency-closure build, strict test types and three-file Biome pass. No runtime
change was needed for the test lint corrections. Review/execution identities and
earlier diagnostics are retained in the feature cache, not rewritten as hardware
acceptance or a whole-package/full-native-manifest pass.

## Remaining end-to-end gates

Actual descriptor acquisition/device association and permissions; installed Node
flag propagation, readiness and exact I/O behavior; a physical adapter with owned
cleanup; trusted channel allocation/nonce generation; CBOR and authenticator
commands; trusted PIN/touch/UV/consent; browser/RP integration and real passkey
acceptance remain required. No real credential, SDK, device/sysfs, socket or TTY
probe was performed by the connection tests, and no denied/stopped lane reopened.
This is one transport prerequisite within the active complete browser goal.
