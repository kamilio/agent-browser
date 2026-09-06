# Bounded internal CTAP CBOR encoding

`src/ctap-cbor-encoder.ts` exports `encodeCtapCbor(CtapCborValue)`, the encoding
counterpart to the typed decoder described in `CTAP-GET-INFO.md`. It emits one
complete canonical item into an owned Uint8Array, with no runtime dependency or
I/O. It is internal infrastructure, not a new agent command, page credential
provider, GetAssertion/MakeCredential implementation or physical passkey result.

## Value and canonicality contract

- Unsigned and negative bigint values cover the full CBOR 64-bit integer domains.
  Integer and definite-length headers use their shortest encoding. Byte strings
  accept genuine Uint8Array/Buffer views, including empty and offset views.
- Text preserves exact Unicode and BOM without normalization. Lone UTF-16
  surrogates reject instead of silently becoming replacement characters. UTF-8
  length is bounded before writing directly into the fixed-capacity output buffer.
- Arrays and maps use actual array containers with captured, bounded lengths and
  own indexed slots. Sparse elements, entries and tuple members reject even when
  their prototypes supply valid fallback values. Own accessors remain host code.
- Maps sort whole encoded key/value spans by canonical key bytes, not JavaScript
  string coercion or insertion order. Container keys are unsupported. A final
  strict decode applies the existing numeric/typed/NaN duplicate policy, rejecting
  equivalent keys instead of overwriting or inventing a second identity rule.
- Simple values retain the supported typed range. Floats retain their exact
  binary16/32/64 representation, including signed zero and NaN payload bits;
  supplied numeric value and wire representation must agree.

The output budget is **7,609 bytes**, including CBOR headers, and at most four
nested map/array containers counting the root as one. Cycles terminate at that
depth bound. Map ordering scratch and collection counts are bounded by the same
output budget. Shared, detached, proxy and out-of-bounds byte views reject;
legitimate empty/resized-valid views remain supported. Caller-owned byte-view
property hooks, iterators and species are bypassed.

These are trusted-host values, not guest-safe handles. Used fields are captured
once per visited occurrence; repeated references may be visited again. Accessors
and array Proxy traps can execute host code and cannot be hard-preempted here.
The encoder does not mutate input containers or sort them in place. Errors are
fresh, fixed-message AgentBrowserErrors without caller error text, paths or causes.
Owned output/order/float/validation byte scratch is wiped on its cleanup paths;
strings and failed partial decoded trees are not whole-heap erased. This is not
secure-memory storage or proof that a host credential was never copied.

## Composition boundaries

The standalone CBOR limit does **not** reserve a CTAP command/status byte or
override transport report-size and advertised authenticator limits. For example,
a 7,609-byte item becomes too large for the 64-byte-report HID capacity after a
command byte is added. Narrow report layouts have smaller capacities. Synthetic
integration tests verify rejection before I/O for both cases. The historical
default send limit also remains a caller-level concern; this writer does not
negotiate or claim to enforce it.

Valid generic CBOR is not necessarily valid GetInfo or another command's schema.
Integration covers canonical capability replies over owned fake HID transports,
exact wire round trips, and separate semantic rejection. It does not activate
PIN/UV, infer user presence/consent, validate RP/clientData bindings or verify
authenticator signatures.

## Validation and provenance

On **September 6, 2026, 07:21:56.673–07:21:58.633 UTC**, the exact six-file native
matrix passed **493 cases, zero failures/skips**: 197 new encoder unit and seven
new integration cases, plus 153 decoder, 69 GetInfo, six GetInfo integration and
61 owned-connection cases. Focused dependency build, strict new-test types and
three-file Biome checks pass. No full-manifest or browser acceptance is claimed.

Independent review identified the inherited-sparse-slot defect before native
execution. Four new finite regressions fail on the unchanged reviewed pre-fix
encoder at **07:22:54.048–07:22:54.641 UTC**, and pass on the fixed implementation.
The other 193 unit cases were unselected in that baseline, not executed failures.
This is a host input-contract regression, not a demonstrated remote exploit.

The first setup's type/style diagnostics are preserved separately; they were
corrected in a new snapshot before native execution. Exact scope, reviewed source,
both native receipts and the immutable 61-file corrected source/build snapshot
are under `node_modules/.cache/native-validation/ctap-cbor-encoding/` and its
`ctap-cbor-encoding-integrated-02/` sibling. The original setup snapshot remains
separate. Pre-existing RP/page-binding changes are excluded.

Historical canonical/RFC evidence remains frozen in the prior CTAP source lanes.
New native GetAssertion-section research is separately preserved under
`node_modules/.cache/native-validation/ctap-get-assertion-source/`, including its
September 6, 2026 07:02:23.949 UTC receipt. It remains partial/unverified and does
not establish descriptor/authData/signature validation, full PIN lifecycle,
clientData/RP policy, empty-allow-list equivalence or continuation behavior.
No source example, real credential/device, SafeJS/SDK or account probe ran here.
All stopped/denied gates and the overall browser goal remain unchanged.
