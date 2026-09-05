# Pure FIDO HID channel-allocation helpers

`src/fido-hid-allocation.ts` adds internal, builtin-only INIT allocation helpers
on top of the existing packet codec. It performs no I/O and activates no hardware
or software authenticator provider. It is not a complete CTAP transaction engine.

## Interface

`encodeFidoHidAllocationRequest(nonce, reportBytes = 64)` requires an exact
eight-byte nonce and returns owned padded reports for broadcast CID bytes
`ff ff ff ff`, logical INIT command `0x06` (wire byte `0x86`). Existing report
bounds of 7–64 bytes apply. The caller supplies the nonce; no entropy source,
freshness guarantee, pending-request state or private-key storage is added.

`decodeFidoHidAllocationResponse(channel, command, payload, expectedNonce)` accepts
separate byte/scalar arguments from an assembled message. It validates the broadcast
envelope, strict logical INIT command, 17–7,609-byte payload and exact eight-byte
expected nonce before checking the echo. A nonce mismatch returns null, never a
usable channel. With a matching nonce, an all-zero or broadcast assigned CID fails.
A mismatched nonce is ignored before interpreting its assigned CID, so an unrelated
response with reserved assignment returns null rather than a candidate allocation.
Malformed envelope, command, byte views or payload bounds always reject first.

A matching response returns independent channel/extension byte arrays, numeric
`protocolVersion`, `deviceVersion: { major, minor, build }`, raw `capabilities`,
and booleans `wink`, `cbor`, `msg`. `msg` inverts the negative NMSG capability bit.
Unknown bits and versions remain available to the caller. Additional response
bytes are preserved within the existing maximum; this is not a promise that an
unknown version is supported. CIDs remain opaque four-byte values, without an
unverified numeric byte-order assumption. Outputs are owned, not frozen objects.

## Input and ownership boundaries

Intrinsic typed-array branding accepts genuine offset, Buffer and cross-realm
byte views without invoking input getters, iterators or species. Nonbyte values,
proxies, shared and detached views fail. Payload bounds are checked before output
copying. Inputs are not mutated or retained after return. Malformed input produces
one fixed `invalid-input` error without embedding device bytes or thrown hook text.

The trusted host's mutable globals/intrinsics are not a guest security boundary.
Nonce comparison is correlation, not a constant-time secret operation, device
authentication, user verification or cryptographic proof of hardware identity.
An attacker-controlled device can construct a syntactically valid response.

The existing one-message assembler closes at completion. A future broadcast
dispatcher must provide a fresh assembler when another complete response needs
consideration; these stateless helpers do not route or own concurrent requests.
Descriptor/report-ID handling, device discovery, random nonces, scheduling,
transaction deadlines, retries, KEEPALIVE/ERROR dispatch, allocated-channel INIT
resynchronization, CANCEL, CBOR commands and trusted PIN/UV/consent remain open.
No real vault, key, credential, RP, touch prompt, HID handle or device was accessed.

## Source and evidence

Contract source is the **January 30, 2019** CTAP specification, especially USB HID
sections 8.1.3 and 8.1.9.1.3. It is historical, not latest-version proof:
`https://fidoalliance.org/specs/fido-v2.0-ps-20190130/fido-client-to-authenticator-protocol-v2.0-ps-20190130.html`.
The browser-only extracted source and qualified contract note are under
`node_modules/.cache/native-validation/heading-section-extraction/research/ctap2/`.
This increment adds no new retrieval or raw HTML fallback.

That separate native request received HTTP 200 on September 5, 2026 at
18:55:21.811 UTC, one request, no redirects, closed transport, partial and
extracted-unverified. Body SHA-256:
`63af11754255f49bca9305ca77be79716a71b5654f3c67e1de946c79c67f9278`.
Receipt SHA-256:
`133cc888de35bf21ff90755397d9a865926505aa15ad8aeb03701345308c5f0b`.
Native extracted Markdown SHA-256:
`527902104d1b22278ddf0973f2e2b4fa0f66d832b692d69cd45671519e698d64`.
The earlier failed full extraction and later final-extractor offline replay remain
separate evidence, described in `HEADING-SECTION-EXTRACTION.md`.

September 5, 2026 validation on clean base `2ef53c5` plus this increment:
**142 passing synthetic native cases across exactly three manifest files**, no
failures or skips: allocation 64 new, packet 17, assembler 61. Independent known
wire fixtures, nonce mismatch positions, truncations, reserved CIDs, capabilities,
extensions, hostile input hooks, ownership and small-report composition are covered.
Loops inside a case are not counted as separate tests. The worker's earlier manual
estimate of 67 cases is superseded by actual runner count 64, not rewritten.

Project build, strict new-test types and two-file Biome checks pass. Initial
format/lint diagnostics, the stopped sandbox patch helper and subsequent successful
scoped formatting remain in
`node_modules/.cache/native-validation/fido-hid-allocation/`.
Independent static review identifies no production defect within scope, but finds
a conditional test assertion that could miss incomplete unrelated responses.
The final test requires exactly one completion on the last report, checks both
decoded outcomes unconditionally and verifies assembler closure. A separately
authorized repeat retains 142 passes; final strict typing and Biome also pass.
The clean compiled candidate is adjacent `fido-hid-allocation-integrated/`.
Native tests and static source checks do not satisfy SDK, physical-device,
real-credential, real-socket, TTY/PTY or live-site acceptance gates. Existing
denied/stopped gates remain unchanged; complete passkeys and browser work stay open.
