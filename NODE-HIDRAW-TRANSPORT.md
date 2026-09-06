# Owned Node hidraw report transport

`src/node-hidraw-transport.ts` provides an internal `NodeHidrawTransport` over
an explicitly granted, already-open `NodeHidrawHandle`. Its structural interface
accepts Node's `FileHandle` type and implements the normalized report contract
used by `FidoHidCborConnection`. It does not open a path, enumerate devices,
discover descriptor metadata, allocate a CID, activate a provider or perform a
WebAuthn ceremony. No public root export or credential provider is changed.

## Trust and ownership

The trusted host must supply exclusive access to the correct Linux hidraw handle,
opened in nonblocking mode, with independently verified input/output descriptor
metadata. This adapter cannot check those prerequisites from a structural object.
Neither a candidate descriptor nor a matching pathname establishes a trusted
authenticator or human consent. Two wrappers around the same file descriptor are
not detected; a module-local WeakSet only prevents reusing the same handle object,
including after closure. Methods and metadata are snapshotted before claiming it.

Input and output report lengths are independently 7–64 bytes; IDs are independently
0–255, defaulting to zero only when omitted. These are normalized HID lengths,
excluding Linux's report-ID convention. The constructor performs no I/O.
One read and one write may coexist; a second operation in the same direction
fails without replacing or canceling the first. The connection can therefore
send CANCEL while it waits for the original response, without the adapter
inventing a response to CANCEL or interpreting CTAP status.

## Complete reports, not a byte stream

Reads ask for the expected OS report size plus one sentinel byte. The expected
size includes an ID byte only for a nonzero input ID. Only the exact integer
expected count is accepted, and a numbered report must have the expected ID.
Short, zero, oversized or malformed reads quarantine the handle. This detects
an oversized report returned up to the sentinel; it does not recover a truncated
tail or prove that all device/driver combinations have been validated.

Only a read rejection with an **own** code of EAGAIN or EWOULDBLOCK retries,
after a 10 ms timer. An own accessor is evaluated once inside error sanitization;
throwing and inherited accessors do not qualify. State is rechecked after host
callbacks. The fixed delay is an engineering policy, not kernel readiness,
measured latency or a physical deadline guarantee. There is at most one actual
read in progress, and close clears/wakes the retry timer without another read.

Writes always prefix the output ID, including zero. Each write is one full OS
report call with position null, and only an exact integer full byte count is
accepted. Success returns the normalized report length. Short or failed writes
are never repaired with suffix writes, resent or retried, including EAGAIN.
Success only establishes the returned count, not authenticator acceptance.

## Closure and buffers

States are open, closing, closed and close-failed. Faults stop further I/O and
initiate closure without delaying the operation's rejection until close finishes.
Explicit close is idempotent and invokes the handle's close method once. Closed
means both captured adapter operations and the handle-close promise settled;
a failed handle close immediately becomes close-failed and cannot reopen the
adapter. Its public close promise still waits for pending operations to settle;
observing close-failed is not evidence that those operations have stopped.

A blocked driver promise can keep closing pending indefinitely. This adapter
does not force-cancel Node I/O or impose its own exchange deadline. Connection
timeout, cancellation request, actual I/O completion and confirmed closure are
separate events. In particular, nonblocking mode is a required host precondition,
not proof that all kernel or driver waits are interruptible.

Write input is copied before I/O. Read/write scratch bytes are wiped only after
their underlying operation settles, never while that operation may still use
them. Read results are separate owned copies transferred to the caller. A close
queued before public success settlement rejects that result and wipes an
untransferred read copy. Driver exceptions and paths are replaced with fixed
errors; report bytes and exception text are not returned as diagnostics.

## Evidence and remaining gates

The focused synthetic validation and review records live under
`node_modules/.cache/native-validation/hidraw-transport/`. They are not a physical
passkey acceptance result. Initial review identified own-code-accessor handling
and a queued-close/public-settlement race; corrections and regression evidence
retain the original runtime and review rather than replacing their history.

Existing source boundaries remain in `NATIVE-HIDRAW-IO.md`,
`LINUX-HIDRAW-REPORTS.md` and `FIDO-HID-CONNECTION.md`. New native-only pinned Node
open implementation research is recorded separately in
`node_modules/.cache/native-validation/node-open-implementation-source/REPORT.md`.
Its September 6, 2026 05:25:22.138 and 05:27:17.305 UTC requests returned matching
bodies; discovery selected the subsequent 40-line extraction. The JavaScript
call site passes flags through a helper and invokes a native binding; it does
not by itself prove numeric flag preservation or libuv/kernel behavior. Both
receipts retain partial/unverified status and are not runtime API probes.

Separate pinned helper research at 05:30:37.943 and 05:31:35.940 UTC on the same
date returned matching bodies and a native-selected 100-line extraction. In
that source, numeric flags return unchanged after the invoked validator accepts
them; this narrows the JavaScript helper question, not the downstream native or
installed-platform behavior. The validator's implementation was not retrieved.
Evidence remains partial/unverified in
`node_modules/.cache/native-validation/node-numeric-flags-source/REPORT.md`.

A separately authorized read-only `ls -1 /sys/class/hidraw` on September 6, 2026
returned no such directory in this execution environment. No device was opened
or commanded. This is not evidence that the host lacks a security key.

Still open: trusted descriptor/handle association, actual open-flag propagation,
permissions and physical short-I/O/disconnect/readiness/shutdown behavior; trusted
channel allocation and CTAP CBOR; human presence, PIN/UV and consent; browser
integration and real relying-party acceptance. Previously denied or stopped
credential, SDK, RP and website gates are unchanged. The full browser goal stays
active.
