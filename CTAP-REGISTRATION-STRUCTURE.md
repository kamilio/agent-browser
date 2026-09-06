# Registration response structure: native source findings

The historical January 30, 2019 CTAP table selected during request-encoder work
was insufficient authority for a modern MakeCredential response parser. New
native browsing follows an actual link from FIDO's official specifications index
to its CTAP 2.1 proposed standard with June 21, 2022 errata. This is a selected
published edition, not a claim that it is the latest CTAP version.

## Response keys

The newer selected table specifies these required fields:

| Numeric key | Field | Type |
| --- | --- | --- |
| 1 | fmt | Text |
| 2 | authData | Byte string |
| 3 | attStmt | Format-specific CBOR map |

It also lists optional boolean epAtt at key 4 and byte-string largeBlobKey at key 5.
Their presence is not permission to expose enterprise attestation or key material
to an agent. A future provider must match requested policy and keep sensitive
extension material inside its trusted boundary.

The older captured table instead labels authData=1, fmt=2 and describes attStmt as
bytes. That original extraction and report remain unchanged. The new comparison
supports implementing the newer mapping; it does not claim knowledge of the
official erratum history or prove behavior of any attached authenticator.

## Embedded credential data

Separately replayed March 4, 2019 WebAuthn text describes attested credential data
as a 16-byte AAGUID, a two-byte unsigned big-endian credential-ID length, that
many ID bytes, and a variable-length canonical-CBOR COSE_Key. Its algorithm
identifier and key-type/algorithm-required parameters must be present; other
optional parameters are prohibited by that selected text. Example EC2 and RSA
keys illustrate representations but do not establish universal key schemas.

A parser therefore needs to delimit one embedded CBOR value before handling any
following structure. `decodeCtapCborPrefix` provides that bounded structural
primitive; it does not validate a COSE public key or authenticate an attestation.
Callers must still validate the expected map/schema and consume or reject all
remaining bytes. A successful generic CBOR parse must not be labeled a valid key.

WebAuthn's separately selected attestation-object section uses text map keys
authData, fmt and attStmt, with byte-string/text/map values respectively. This
WebAuthn object is not the numeric-key CTAP transport response. The format's
signing procedure receives authenticator data and the serialized-client-data
hash; parsing either object is not signature verification.

## Provenance and gates

All source text comes through this repository's frozen native browser, not an
external browser, web-search tool or raw-HTML fallback. September 6, 2026:

- Official index receipt 09:47:12.032 UTC: one GET, no redirect, HTTP 200.
- Linked CTAP receipt 09:48:43.307 UTC: one GET, no redirect, HTTP 200.
- CTAP offline section replay 09:51:03.144 UTC: no GET, unchanged revision 39932.
- WebAuthn offline replay 09:51:04.576 UTC: no GET, unchanged revision 43551;
  its original receipt remains September 5 at 05:44:55.797 UTC.

Native sessions/trees close. All observations retain partial/unverified status
and null contentSuccess. Sources are preserved under the cache lanes
`fido-specifications-index`, `ctap21-errata-headings`,
`ctap21-make-credential-offline` and `webauthn-attestation-offline` in
`node_modules/.cache/native-validation/`. Their receipts, body/section identities,
outlines, bounds and original logs are retained separately.

No real authenticator, account, credential, PIN, SDK, socket server or TTY probe
ran. Full COSE schemas, attestation formats/trust, signature verification, RP and
ceremony binding, consent, extension policy and actual device/page registration
remain open gates. Historical request-encoder measurements are not relabeled as
new live registration acceptance.
