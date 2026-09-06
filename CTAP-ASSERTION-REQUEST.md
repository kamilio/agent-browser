# Bounded CTAP assertion requests

`encodeCtapGetAssertionRequest` in `src/ctap-get-assertion-request.ts` encodes the
historical CTAP2 GetAssertion command (`0x02`) using the existing canonical CBOR
encoder. This internal module is not a newly enabled authenticator provider or
public package entry point. It does not send requests or start a ceremony.

## Contract

The input supplies an already-authorized RP ID, the 32-byte SHA-256 hash of
serialized client data, an optional nonempty allow-list of `public-key` credential
IDs, and an optional boolean UV request. Encoded parameters use keys 1, 2, optional
3 and 5 respectively. The options map always requests UP; UV defaults to false.
Requesting either flag is not proof of presence, verification or consent.

The serializer does not derive authorization from an RP string, hash a raw
challenge, choose an account, interpret `preferred` verification policy or select
a transport. Callers must explicitly perform those tasks. Transport hints are not
wire inputs here. PIN fields, extensions, unknown fields and accessor properties
are rejected rather than silently ignored. PIN/UV token support remains open.

The second argument is a positive unsigned-64-bit `bigint` message-size limit,
normally obtained from GetInfo. Omission defaults to 1024 bytes, not the HID
ceiling. Both that limit and the 7609-byte global HID ceiling include the command
byte as well as CBOR parameters. Smaller report formats can impose a lower
connection-layer capacity; successful encoding is not a promise of transport fit.

An explicit empty allow-list is rejected: the selected historical section does
not resolve its semantics, so this API does not quietly turn it into unrestricted
credential discovery. A caller deliberately selecting discoverable credentials
omits the field. Local defensive caps are 64 descriptors and 1023 bytes per ID,
matching existing broker policy; the RP string also has a 7609-code-unit allocation
cap. These are not claims that the selected standard mandates those limits.

## Ownership and trust

Inputs use own data fields and real, nonshared Uint8Array views. Captured indexed
array slots reject sparse/inherited/accessor entries and bypass custom iterators.
Intrinsic byte copying bypasses caller view hooks. Output is an owned copy;
temporary owned hash/ID copies and encoded parameters are wiped after completion
or failure. This does not erase caller-owned memory, immutable strings, all runtime
copies or the process heap.

Host Proxy descriptor traps can still execute. This trusted-host encoder is not a
guest sandbox, timing boundary or permission mechanism. Errors contain fresh fixed
messages, never an arbitrary caller exception or credential dump. No passwords,
private keys, PINs or vault entries are required by this API or its tests.

## Native source evidence

Only this repository's native browser supplies external source text:

- `node_modules/.cache/native-validation/ctap-get-assertion-source/extraction.md`
  selects historical January 30, 2019 CTAP section 5.2; receipt September 6, 2026,
  07:02:23.949 UTC. It establishes the command, parameter fields and UP/UV defaults.
- `node_modules/.cache/native-validation/ctap-message-source/extraction.md`
  establishes the one-byte command plus optional CBOR parameters and default
  1024-byte message limit absent a larger advertised GetInfo limit.
- `node_modules/.cache/native-validation/webauthn-assertion-offline-02/credential-descriptor.md`
  supplies the descriptor's required type and ID fields.
- `node_modules/.cache/native-validation/webauthn-assertion-fields-offline/collected-client-data.md`
  establishes SHA-256 over JSON-serialized client-data bytes, not the raw challenge.
- `node_modules/.cache/native-validation/webauthn-assertion-fields-offline/credential-type.md`
  supplies the historical `public-key` enum. The historical authenticator-data
  U2F-compatibility discussion separately describes the 32-byte client-data hash.

The WebAuthn material is the March 4, 2019 Recommendation originally captured on
September 5, 2026 at 05:44:55.797 UTC. The new fields replay occurred September 6
at 08:14:53.733 UTC, without a new GET or direct raw-HTML text inspection. Its
original body SHA-256 remains
`0173a74367a88ac40cc2564abe4b4d5af000a3d81e3eec50bcb14fb16106062e`.
Historical and offline timestamps are not interchangeable; none of these sources
is presented as the latest CTAP/WebAuthn release or real-device validation.

## Validation

On September 6, 2026 the isolated six-file native matrix passed 525 synthetic
cases: 110 new unit cases, 11 new integration cases, and 404 existing encoder,
GetInfo, broker and HID-connection cases. The installed TypeScript build, strict
types for all six test files and Biome for the three new files also pass.

Independent byte fixtures check the command and canonical parameter layout;
roundtrip checks are supplemental rather than the sole wire oracle. Integration
checks connect broker-supplied RP/clientDataHash to the serializer, propagate
decoded GetInfo message limits and frame requests through in-memory report
transports. The broker fixture explicitly maps its already-selected credential
IDs and verification policy; no production provider is activated by the tests.

Exact sizes include the command byte, with default, negotiated and global-cap
boundaries. Tests distinguish selected-report capacity from the global ceiling,
check copied-input isolation/cleanup and exercise malformed host input. The new
API had no previous implementation, so no artificial import-failure baseline is
presented as a behavioral regression proof. Original evidence and input hashes
are in `node_modules/.cache/native-validation/ctap-assertion-request/evidence/`.

## Remaining ceremony work

PIN authentication, extension negotiation, assertion-response interpretation,
signature verification and an owned GetNextAssertion transaction remain separate.
Continuation must preserve RP/clientData association, prevent interleaving, bound
account counts/time/bytes and quarantine uncertain state without retrying a
possibly state-advancing request. This serializer does not establish those rules.

Actual device acquisition, authenticator I/O, human verification/consent,
registration, account authentication and page/SafeJS acceptance remain unverified
gates. The pending parent-RP feature is neither included nor authorized here.
