# Public credential keys and registration authenticator data

These internal native TypeScript parsers validate a bounded structural profile.
They do not activate an authenticator or expose credential data through an agent,
command, page or public package export. No new dependency is used.

## Public-key profile

`decodeCtapCredentialPublicKey` requires exactly one canonical CBOR map.
`decodeCtapCredentialPublicKeyPrefix` returns `{ publicKey, bytesRead }` for one
key and deliberately leaves the suffix unchecked. Its 7,609-byte cap includes
the entire supplied view, not just the consumed prefix. Existing CBOR depth,
canonical ordering, duplicate-key, shortest-integer and UTF-8 checks apply.

Required COSE labels and their values use actual CBOR integers. Float-valued or
text aliases are not accepted. The archived WebAuthn public-key profile requires
the algorithm and excludes optional/private parameters; this is stricter than
a general-purpose COSE key object. Exact supported member sets are:

| Key type | Labels | Algorithms | Curve/size profile |
| --- | --- | --- | --- |
| EC2 (2) | 1, 3, -1, -2, -3 | ES256 -7, ES384 -35, ES512 -36 | P-256/384/521 (1/2/3), coordinates 32/48/66 bytes |
| OKP (1) | 1, 3, -1, -2 | EdDSA -8 | Ed25519/Ed448 (6/7), public encoding 32/57 bytes |
| RSA (3) | 1, 3, -1, -2 | PS256/384/512 -37/-38/-39; RS256/384/512 -257/-258/-259 | Minimal unsigned big-endian modulus and exponent |

EC2 accepts every supported algorithm/curve combination: RFC8152 recommends
matching hash and curve sizes for interoperability but does not require it.
The y value may be a fixed-width coordinate or a compressed-point boolean;
leading coordinate zeros are retained. P-curve widths are explicit supported
profile lengths, not evidence that any supplied point lies on its curve.
EdDSA sizes refer to public-key encodings, not 64/114-byte signatures.

RSA requires a modulus of 2,048–16,384 bits and a nonempty exponent of at most
2,048 bytes, with no redundant leading-zero octets. The upper bounds are local
resource policy, not universal RSA limits. This does not check primality,
oddness, exponent range or RFC7518 exponent restrictions. RFC8812 marks SHA-2
PKCS1 signatures Not Recommended; recognizing their wire IDs is compatibility
support, not an endorsement. Deprecated RS1, key-agreement curves, symmetric
keys, unknown algorithms/curves and optional/private key members are not supported.

## Registration layout

`decodeCtapRegistrationAuthenticatorData` reads the RP hash, flags, unsigned
32-bit big-endian counter, AAGUID, unsigned 16-bit big-endian ID length, ID,
one validated key prefix and optional extensions. Credential IDs must be nonempty
and at most 1,023 bytes under this local CTAP profile, not a claimed universal
WebAuthn wire maximum. The whole input remains bounded to 7,609 bytes.

AT must be set. BS without BE is rejected. This structural layer does not require
UP/UV or invent a rejection rule for reserved flag bits: a ceremony must enforce
its own requirements. ED requires one following fully consumed canonical CBOR
map; absent ED forbids any suffix. Extension identifiers must be nonempty text
in this profile. An empty extension map is allowed. Unknown extensions remain
opaque parsed values inside the trusted host, not authorized extension outputs.

The result owns separate RP-hash, AAGUID, ID, encoded-key and decoded-key arrays,
plus any decoded extension tree. It does not alias the caller's input. Owned
input and reachable temporary CBOR byte/float allocations are wiped, including
partially assembled results on failure. Errors are fixed and value-free, with
invalid-input, resource-limit or unsupported classification. This is not a
whole-heap erasure guarantee: unreachable partial decoder allocations, strings,
external copies and transferred storage are not thereby erased.

## Source provenance

All source text was obtained through this repository's frozen native browser.
On September 6, 2026, the RFC8152 HTTP-200 receipt at 10:14:12.635 UTC ended in a
whole-document extraction resource-limit failure. A separate HTML text-line
query failed as unsupported. Both failures remain preserved. A separately
authorized offline heading-section replay at 10:20:00.989 UTC succeeded without
new requests, reading §§7, 8.1, 8.2 and 13 with unchanged revision 4312.

The RFC8230 receipt at 10:17:08.668 UTC supplies RSA public-key parameters and
PSS algorithms. Separate RFC8032 and RFC8812 navigations at 10:33:24.265 and
10:33:25.038 UTC supply EdDSA encoding lengths and PKCS1 identifiers/security
qualifications. Each successful document navigation received HTTP 200 after one
redirect and closed its native session. Results remain partial/unverified with
null contentSuccess; these are selected published documents, not latest-registry
or browser/device compatibility claims. Archived WebAuthn layout and flag source
identities remain unchanged.

Exact receipts, input/body/section hashes, original failures and bounded replay
records are retained in the `cose-key-source`, `cose-key-discovery-offline`,
`cose-key-sections-offline`, `cose-rsa-source`, `cose-signature-sources` and
`webauthn-attestation-offline` cache lanes under
`node_modules/.cache/native-validation/`.

## Validation

The exact seven-file native matrix passes 788 cases, including 80 new public-key
and 52 new registration-data cases. Installed TypeScript build, strict test types
and four-file Biome checks pass. Final native run: September 6, 2026,
10:40:20.707–10:40:22.502 UTC. Fixtures use independent wire bytes, not just
encoder round trips, and cleanup assertions observe actual nonzero allocations.

The first run at 10:39:06.568–10:39:08.401 UTC preserved 787 passes and one
test-only failure: comparing Buffer and Uint8Array objects rather than their
bytes. Only that assertion changed before the fresh successful run; runtime did
not change. A static review's incorrect-copy-spy finding was corrected before
either run. Both test snapshots/logs and input inventories remain preserved;
no absent-new-API baseline is claimed. Evidence is in the
`ctap-credential-structure` cache lane, with final candidate based on committed
dependency closure rather than the unrelated dirty working tree.

## Remaining acceptance gates

Parsing does not verify curve points, RSA mathematics, signatures, attestation
formats/chains, RP/client-data/algorithm-offer binding, UP/UV/consent, extension
policy or device/page registration. The numeric CTAP MakeCredential response and
text-key WebAuthn attestation object are separate outer structures still requiring
integration. No existing broker/provider switches to these helpers implicitly.
All stopped/denied device, account, SDK, socket and TTY gates remain unchanged;
the complete browser goal remains active.
