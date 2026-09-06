# Bounded native registration exchange

`makeCtapCredential` connects the MakeCredential request encoder, native HID CBOR
connection and registration-data/key parsers. It is an internal trusted-host
operation, not a newly activated browser provider. It does not open a device,
look up credentials/PINs, grant consent or construct a page-visible WebAuthn result.

## Response structure and policy

`decodeCtapMakeCredentialResponse` consumes status plus one canonical CBOR map.
Nonzero status alone is a typed CTAP error; a supplied error suffix must still
be exactly one valid map. Success requires fmt at numeric key 1, authenticator
data at 2 and a map-valued attestation statement at 3. This follows the selected
CTAP 2.1 errata edition, not the older captured table with swapped fields.

Known numeric keys recognize integer-valued float equivalents consistently with
the existing CTAP response parsers; embedded COSE keys retain their stricter
typed-integer schema. Unknown fields are structurally validated then discarded.
Format text is nonempty and capped at 64 UTF-16 units under local policy. Unknown
nonempty formats and their canonical map statements remain opaque: no signature,
certificate-chain, attestation-format or trust verification is implied.

Enterprise-attestation flag 4 must be boolean. False is accepted; true is
unsupported because no enterprise-attestation policy is configured. Field 5 must
be bytes but is always unsupported, including empty bytes: this request profile
cannot request largeBlobKey, and no such key material is forwarded. These checks
are not a guarantee that arbitrary attestation statements contain no identifying
data; disclosure policy remains a separate required provider boundary.

Raw authenticator data and its parsed RP hash, flags, counter, AAGUID, credential
ID, public key and extensions are separately owned. The chosen attestation
statement is deeply cloned, preserving byte strings and raw float encodings.
Original decoded buffers and discarded unknown fields are wiped. The internal
cleanup helper tolerates detached buffers and ignores own fill overrides while
continuing other wipes. It expects the internal DTO shape, not hostile host objects.

## Request and ceremony binding

Before its first await, the transaction encodes command 01 and decodes that exact
wire into an owned snapshot. Later caller mutations cannot change the RP ID,
client-data hash, offered algorithms, excluded IDs or requested rk/uv sent on
the wire or used by validation. SHA-256 is applied to the UTF-8 snapshot RP ID.
The response must have:

- The expected RP hash and UP flag.
- UV when requested, without rejecting unsolicited successful UV.
- A supported public-key algorithm present in the original offered list.
- A credential ID absent from the original exclusion list.
- No extension data: even an empty ED map is unsolicited by this request profile.

This does not prove that a statement signs the client-data hash, that the key is
mathematically valid, or that a credential was associated with/persisted for the
requested user. Those claims require further cryptographic/protocol/device work.
The result reports userPresent/userVerified flags and residentKeyRequested, not
userConsented, confirmed residency, registered status or an attestation object.
Origin/RP normalization and authorization remain the existing broker's job; no
parent-RP policy is widened here.

## Ownership, cancellation and limits

One captured-prototype exclusive scope covers the single HID exchange and all
response checks; there are no continuation commands. Malformed, policy-rejected,
CTAP-error and HID-error results quarantine that scope through the connection's
private close path. Preflight failures or busy acquisition do not close another
owner. Instance exchange/close overrides are not used as a security boundary.

The deadline covers hashing, exchange and validation. Timeout defaults to
120,000 ms, bounded to 1–120,000. Response bytes default to and cannot exceed 7,609,
including status. This is a single-response limit, unlike the assertion
collector's cumulative multi-response budget. The existing request encoder
controls maxMessageSize, default 1,024 and capped at 7,609 including command.
Options require exact own data properties; signal access uses intrinsic branding
and listeners rather than caller-provided own accessors/methods.

Uncommitted exceptional exits also recheck the absolute deadline before selecting
an underlying error. A parser or rejected promise can cross the deadline before
its timer callback runs; disarming that overdue timer must not conceal a timeout.
This recheck does not extend the old operation's authority after its success commit.

Abandoned late hash/response buffers are wiped. Success commits and disarms its
deadline/listener inside the exclusive callback, before ownership handoff, so an
old abort or timer cannot close a subsequent owner. Temporary encoded requests,
snapshots, RP bytes/hash and rejected credential data are wiped; successful output
is transferred to the trusted caller. Errors are fixed and value-free. This is
not whole-heap erasure: unreachable decoder allocations, immutable strings,
copies/transferred storage and hostile host-runtime mutation remain limitations.

## Validation

The exact ten-file native matrix passes 774 cases, including 64 new response,
49 new binding and 38 new lifecycle cases. Build, strict test types and five-file
Biome checks pass. Native run: September 6, 2026, 18:16:46.062–18:16:48.461 UTC.
These are memory-transport/packet/decoder tests, not actual device ceremonies.

Independent review found the exceptional-deadline gap before native validation.
Four clock-only regressions exercise real encoding, digest rejection, owned write
rejection and response parsing without firing timeout timers. A separate copy
with the preserved pre-fix transaction source fails all four with the expected
underlying-error classifications, while the fixed candidate passes. That selective
negative control ran at 18:17:26.370–18:17:27.083 UTC: zero passes, four assertion
failures and 34 unselected cases; it is not an absent-API baseline or harness timeout.
Initial test-only type/style failures and both setup snapshots are also preserved.

The `ctap-registration-transaction` cache lane records exact scopes, original
results, pre-fix source identity, immutable snapshots and input inventories under
`node_modules/.cache/native-validation/`. Unrelated dirty work is excluded from
the committed-dependency candidate.

## Evidence and remaining gates

Source facts reuse previously frozen native-browser extractions. The selected
CTAP 2.1 receipt remains September 6, 2026, 09:48:43.307 UTC, and its MakeCredential
offline replay remains 09:51:03.144 UTC. Archived WebAuthn and RFC key-source
identities/partial outcomes are unchanged. This implementation does not claim a
new navigation, new live validation or latest-standard completeness.

Relevant contracts are `CTAP-MAKE-CREDENTIAL-REQUEST.md`,
`CTAP-CREDENTIAL-STRUCTURE.md` and `CTAP-REGISTRATION-STRUCTURE.md`. Device opening,
PIN/UV interaction, explicit genuine consent, attestation privacy projection and
cryptographic trust, page/provider integration, actual discoverability and real
registration acceptance remain open. No stopped/denied account, device, SDK,
socket or TTY gate is cleared. The complete browser goal remains active.
