# Internal CTAP CBOR and GetInfo boundary

The native passkey transport now has an internal, dependency-free CTAP decoder
and capability query. This is a bounded historical CTAP2/GetInfo implementation,
not a connected authenticator, enabled page credential provider or successful
passkey registration/assertion. Existing transport ownership remains required.

## Wire parsing

`src/ctap-cbor.ts` exports `decodeCtapCbor`, `copyCtapBytes` and `ctapCborLimits`.
Input is one complete, nonempty, owned-copy Uint8Array view, at most 7,609 bytes.
Buffer and offset views work; proxies, shared, detached, empty and out-of-bounds
storage reject. Intrinsic getters bypass caller-owned property hooks. Decoding
does not mutate caller storage; returned byte strings and float encodings own
independent copies. Temporary input copies are wiped in finally blocks. This is
not whole-heap erasure: strings, ignored values and partially constructed trees
are not recursively scrubbed or secure memory.

The typed result preserves unsigned/negative integers as bigint, exact UTF-8 text
including BOM, byte strings, arrays, maps, simple values and IEEE float values
with their original wire encoding. Declared lengths are bounded by remaining
input before allocation. The root counts as container depth one; entering a
fifth container rejects. Definite lengths and shortest integer/length encodings
are required. Tags, breaks, reserved forms, malformed UTF-8, trailing bytes,
duplicate keys and noncanonical map order reject. Container map keys are outside
this profile and return unsupported, rather than silently stringifying them.

Map ordering follows the saved CTAP major-type/length/byte rules. Numeric keys
use historical RFC7049 value equivalence, including integer/float and signed
zero, without rounding bigint into Number. Text, byte and simple keys stay
distinct. The historical NaN gap is explicitly filled using RFC8949's comparison
of raw significands right-zero-extended to 64 bits. Equivalent width/sign
representations collide; distinct significands remain distinct. Sign independence
is an inference from that criterion. This does not adopt RFC8949's entire generic
data model, which otherwise distinguishes integers from floats. Unknown but valid
simple values remain typed values for forward-compatible unknown fields.

## Capability semantics

`src/ctap-get-info.ts` exports `encodeCtapGetInfoRequest`,
`decodeCtapGetInfoResponse` and `queryCtapGetInfo`. Each request is a fresh single
byte `0x04`. Success requires a complete map containing versions and a 16-byte
AAGUID. Versions/extensions preserve unknown strings, order and present-empty
lists. Optional message size and PIN protocol identifiers retain full unsigned
bigint values; advertised size never controls an allocation. The AAGUID is a
claim, not authentication or trust evidence.

Options default to platform/resident-key false and user-presence true. PIN and
user-verification states distinguish unsupported, unconfigured and configured.
Known options require booleans; unknown keys are ignored only after full wire
validation. Historical section 6.2's simple-21-only label is inconsistent with
section 5.4's explicit false semantics; this implementation accepts both RFC
boolean encodings rather than rewriting the source evidence.

All nonzero CTAP status bytes remain distinct from transport HID errors. An error
may have no body or a valid map; malformed optional bodies reject. The query makes
exactly one exchange on an existing `FidoHidCborConnection`, forwards its options,
and wipes the returned payload after decoding. Malformed replies initiate close
without waiting for a potentially hanging handle close; the connection is
quarantined synchronously. There is no automatic retry, channel allocation,
reopening, provider activation, user-presence inference or consent inference.

## Validation and evidence

On **September 6, 2026, 06:57:24.298–06:57:25.719 UTC**, the final separately
authorized six-file native matrix passed **464 tests, zero failures/skips**:
153 new parser, 69 new GetInfo and six new integration cases, plus 61 existing
connection, 92 existing Node hidraw and 83 existing report-codec cases. These
tests use synthetic wire vectors and fake handles, not real files/devices or
credentials. The focused dependency build, strict new-test typecheck and
five-file Biome check also pass. No full-manifest or whole-browser pass is claimed.

The initial 459-case pass at 06:45:10.993–06:45:12.259 UTC remains unchanged.
Static review found two assertion blind spots and three edge-coverage gaps, not
a runtime defect. The final suite checks nondefault float-key options and actual
AAGUID data isolation, plus low NaN payload bits, large integral equality and
same-header lexical ordering. Runtime files are unchanged between both runs.

The isolated 56-file source/build snapshot derives from committed `9fee171` plus
only the five new TypeScript files and three explicit native manifest entries.
Raw initial outputs, exact scope, input identities and review are retained under
`node_modules/.cache/native-validation/ctap-get-info-implementation/`; its sibling
`ctap-get-info-implementation-integrated-02/` is the immutable final tested
snapshot. The earlier `ctap-get-info-implementation-integrated/` and initial
candidate remain separate, unchanged evidence.
Pre-existing RP, page-binding and other working-tree changes are excluded.

Source prerequisites and their original limits remain in
`CTAP-GET-INFO-BOUNDARIES.md`. Additional native RFC7049 and RFC8949 observations
are preserved in the `ctap-cbor-decoder-source/` and `ctap-nan-key-source/` cache
lanes, including exact timestamps, receipts, hashes and frozen inventories.
All remain partial/extracted-unverified with null contentSuccess. Captured bytes
were used for integrity only; source text came from native extraction. No source
example, benchmark, external runtime or code retrieved from those sources was
executed.

## Outstanding passkey gates

Device discovery/open authorization, real nonblocking-handle behavior, trusted
descriptor/channel allocation, GetInfo interoperability and a human-owned
authenticator session still need independent evidence. MakeCredential and
GetAssertion encoding/validation, client data and RP/origin binding, PIN/UV and
human-consent flows, attestation/assertion verification, cancellation on real
hardware and page-provider integration are not established here. The denied
RP/SafeJS/SDK and other stopped gates remain unchanged. This internal foundation
does not make passkeys ready for accounts or establish cloud challenge bypass.
