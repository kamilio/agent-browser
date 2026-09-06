# Bounded canonical CBOR prefix decoding

`decodeCtapCborPrefix(input)` in `src/ctap-cbor.ts` returns
`{ value, bytesRead }` for exactly one complete initial CBOR item. The consumed
count is relative to the supplied byte view. This supports embedded structures
such as a credential public key followed by separately encoded extension data;
see `CTAP-REGISTRATION-STRUCTURE.md` for the native source evidence.

The existing `decodeCtapCbor(input)` remains a whole-input decoder and still
rejects any trailing bytes. Existing callers do not implicitly switch to prefix
parsing. Both APIs share the same decoder, canonicality rules, numeric/key
semantics, fatal UTF-8 handling, depth 4 limit and intrinsic input validation.

The complete supplied view must be nonempty and at most 7609 bytes, even if its
first item is tiny. The prefix API does not inspect or validate unconsumed bytes.
Callers must validate the expected item type/schema and consume or reject the
remainder. It is not an unbounded CBOR-sequence reader, offset-based parser,
COSE validator, attestation verifier or passkey provider.

The whole supplied view is copied and the private copy wiped on either outcome.
Returned byte/float encodings are independent owned arrays, not aliases of caller
input or wiped scratch storage. Input bytes remain untouched. As with the existing
decoder, partial allocations hidden before a parse failure and immutable strings
are outside a complete-erasure guarantee. Error classifications and messages
remain the existing bounded CBOR errors.

## Validation checkpoint

September 6, 2026, 10:03:11.538211231–10:03:13.131194058 UTC: 733 cases pass
across the exact six-file native scope, including 68 new prefix tests. The other
665 cover the strict decoder, encoder, GetInfo, assertion responses and assertion
collector. Build, strict test types and scoped Biome pass. This is not a full
manifest or actual authenticator pass.

New cases compare exact values and consumed lengths across CBOR types, reject
malformed initial items, preserve strict whole-input suffix rejection, bound the
whole supplied view, and check offset/nested ownership. Call-through fill spies
observe nonempty owned input copies being wiped on success and failure. A
synthetic map-sequencing fixture demonstrates boundaries, not a valid COSE key.

The native matrix ran once. Original inputs, JSON/logs, timestamps and audit are
under `node_modules/.cache/native-validation/ctap-cbor-prefix/`. No artificial
failing baseline is used for a previously absent API. The separately recorded
source work uses two public GETs and two offline native replays, not a device,
credential, SDK or registration-ceremony probe.
