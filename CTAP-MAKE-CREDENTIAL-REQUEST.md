# Bounded CTAP registration request encoding

`encodeCtapMakeCredentialRequest` in `src/ctap-make-credential-request.ts`
serializes an internal, already-authorized registration request. It does not
open a device, activate a provider, obtain permission, verify attestation or
claim successful registration. The browser broker remains responsible for
origin/RP policy and WebAuthn option normalization.

## Wire contract

The result is command byte `0x01` followed by a canonical CBOR map:

| Key | Value |
| --- | --- |
| 1 | Exactly 32 clientDataHash bytes |
| 2 | RP entity with required text id and optional name |
| 3 | User entity with required byte id and optional name/displayName |
| 4 | Ordered public-key/algorithm parameter maps |
| 5 | Optional nonempty exclusion descriptor array |
| 7 | Explicit rk and uv booleans, each defaulting false |

MakeCredential does **not** reuse GetAssertion's `up` option. The selected
historical protocol maps required presence to implicit authenticator behavior,
not a request field. It still requires permission and presence checks; omitting
an option is not permission to suppress them. Requested UV is not evidence that
verification occurred, and requested resident storage is not evidence it exists.

The trusted caller chooses concrete `residentKey` and `userVerification` booleans
after applying capabilities and required/preferred policy. This serializer does
not silently turn preferred into required or infer a capability. It preserves
algorithm preference order and duplicates, without validating registry membership
or selecting a supported algorithm.

RP/user display metadata is optional at this internal protocol boundary even
though the WebAuthn broker may require it in its creation API. Names are untrusted
display text and are never fetched or rendered here. Icon URLs, transport hints,
extensions, PIN fields, generic options and presence overrides are rejected as
unsupported own fields rather than silently stripped. No ambient PIN or provider
discovery occurs. Authenticators configured with a client PIN may require a PIN
flow that this serializer does not implement.

## Input and memory bounds

All records use own data properties; own accessors, symbols and unknown fields
are rejected. Inherited values cannot supply required fields. Sequences require
real arrays with own indexed data slots; holes, inherited indices and accessors
are rejected, and custom iterators are not invoked. Host Proxy traps can still
execute during reflection: this is not a hostile-host sandbox.

Local engineering limits are 16 algorithm parameters, 64 exclusion descriptors,
1023 bytes per excluded credential ID, 64 bytes per nonempty user ID, 256 UTF-16
units per optional name/displayName, and 7609 units per nonempty RP ID. Algorithm
numbers must be nonzero safe integers; positive and negative values become exact
CBOR integers. Zero rejection and these caps are local policy, not a claim that
the selected historical section proves registry or universal field limits.

A supplied exclusion list must be nonempty. A caller with an empty normalized
broker list can omit it explicitly; the encoder does not claim a general
present-empty/absent equivalence for every CTAP command. Optional empty display
strings are preserved. The canonical encoder rejects malformed UTF-16.

`maxMessageSize` is a positive uint64 bigint, default 1024. The limit includes the
command byte and is always capped at 7609; an advertised GetInfo value can tighten
or enlarge the default only within that global cap. Report-capacity constraints
remain the connection's responsibility. Invalid fields produce a fresh fixed
`invalid-input` error; explicit size/count bounds produce `resource-limit`.

Hash, user ID and exclusion IDs are copied intrinsically before encoding. Owned
copies and temporary encoded parameters are wiped on success and failure. The
successful output is fresh caller-owned storage; caller inputs stay untouched.
Immutable strings and hidden codec allocations cannot be completely erased by
this wrapper, and no whole-process secret-erasure guarantee is made.

## Native source provenance and remaining gates

`node_modules/.cache/native-validation/ctap-make-credential-offline/` contains a
new offline native-browser extraction of the January 30, 2019 CTAP proposed standard
MakeCredential section. The original HTTP receipt is September 6, 2026 at
07:02:23.949 UTC; offline replay is 09:30:12.143 UTC, not another live retrieval.
The 332248-byte body has SHA256
`983411add7e48e729a5cfd042cc810faa91c8affbd3bc227883bd048e2bc4ab5`.
The 12129-byte native section has SHA256
`b09e4a7aad34839ae89e911abc95a286c3aa9c046a251d45f9d29dc7b3a7f8b7`.
The 20 frozen artifacts preserve partial/unverified status, null contentSuccess,
closed native tree and unchanged original evidence. No raw HTML text was read.

The selected historical response table reports authData=1, fmt=2, attStmt=3 and calls
attStmt a byte array. This request-only patch does not promote those entries
into a modern response parser. Response mapping, attestation structures and
modern interoperability require separate authoritative evidence. The serializer
also does not implement PIN tokens, extension processing, authenticator trust,
credential persistence, real consent or a complete platform/page ceremony.

## Validation checkpoint

September 6, 2026, 09:40:45.390898817–09:40:48.158228110 UTC: 646 cases pass in the
isolated seven-file native scope. New cases are 116 unit and 16 integration; the
remaining 514 cover the canonical encoder, GetInfo, committed exact-host broker,
HID connection and GetAssertion request encoder. Build, strict types for all
seven test files and scoped Biome pass. This is not a full-manifest result.

Literal minimal/full fixtures check wire keys and bytes independently. Integration
checks asymmetric in-memory framing, GetInfo size limits and creation-context
mapping. Fake providers capture the request then reject rather than fabricate an
attestation or successful credential. No actual authenticator or account is used.

The first setup passed build/Biome but rejected two test callbacks that returned
an assertion-helper error object instead of void. Only those callbacks changed
before the successful second setup; no runtime change was needed. The exact native
scope ran once. Original setup logs, execution JSON, times and immutable input
hashes remain under `node_modules/.cache/native-validation/ctap-make-credential-request/`.
No artificial failing baseline is constructed for a previously absent API.
