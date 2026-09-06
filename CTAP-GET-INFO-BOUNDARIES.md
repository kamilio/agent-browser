# GetInfo capability negotiation: source boundaries

This records native-browser observations from **September 6, 2026 UTC** before
implementing a CTAP GetInfo parser. It is not a device query, parser pass, full
passkey implementation or real relying-party acceptance. The sources are the
**January 30, 2019 CTAP document** and its **October 2013 RFC7049 reference**, not
claims about the latest protocol or current-device conformance.

## Established historical contract

GetInfo is command `0x04` with no parameters. Its success map requires version
strings and a 16-byte claimed AAGUID. Extensions, options, maximum message size
and unsigned PIN-protocol versions are optional. Option defaults distinguish
unsupported from supported-but-unconfigured and configured: absent clientPin/uv
is not equivalent to false. Absent plat/rk defaults false; absent up defaults true.
Advertised capabilities do not prove user presence, verification or consent.

The message section specifies a status byte (zero success, otherwise error),
optional definite-map response data, shortest integer/length encodings, definite
lengths, ordered maps, no tags and at most four map/array nesting levels. It
recommends rejecting duplicate/noncanonical maps, requires ignoring unknown keys,
and forbids sending over 1024 bytes without a larger advertised limit. Float
representations are not canonicalized. The generic reply description does not
establish a prohibition on error response data.

RFC7049 section 2.3 distinguishes major-type-7 simple values, 16/32/64-bit floats,
unassigned/reserved forms and the indefinite-item break. It does not establish
map-key equality, all invalid-form handling or UTF-8 rules in the retrieved range.

## Implementation consequences, not completed features

- Keep HID transport errors separate from CTAP status bytes and malformed CBOR.
  Do not label an opaque HID response as successful capability negotiation.
- Preserve meaningful absence/default distinctions; never turn advertised PIN,
  UV or presence capability into evidence of a completed ceremony.
- Validate framing/canonical structure while ignoring unknown fields as required.
  A parser that rejects all unfamiliar values merely to simplify implementation
  would not establish the intended forward-compatible behavior.
- Bound input bytes, nesting, parsing work and owned allocations before accepting
  device-controlled lengths. Do not allocate an advertised maximum message size.
- Establish unusual map-key duplicate semantics, invalid simple forms and UTF-8
  behavior before claiming a complete canonical decoder. Unassigned does not,
  by itself, establish that a representation is invalid.
- Do not promote the verifier-specific CBOR in
  `scripts/passkey-probe-verifier.ts` into a generic runtime parser unchanged:
  it does not support the required array/boolean subset. The existing internal
  software-authenticator encoder is also not a GetInfo decoder.

These are requirements for the next implementation slice, not claims that it
exists. Trusted device/descriptor association, physical I/O and channel allocation,
human PIN/UV/consent, browser integration and real RP acceptance remain open.

## Native provenance

| Source observation | Response received UTC on September 6, 2026 | Native evidence lane |
| --- | --- | --- |
| CTAP GetInfo section | 05:54:23.534 | `node_modules/.cache/native-validation/ctap-get-info-source/REPORT.md` |
| CTAP Message Encoding section | 05:56:28.020 | `node_modules/.cache/native-validation/ctap-message-source/REPORT.md` |
| RFC7049 discovery and selected lines 655–754 | 06:02:10.092 / 06:02:49.357 | `node_modules/.cache/native-validation/ctap-cbor-simple-source/REPORT.md` |

All four requests had separate exact authorization, used only the frozen native
browser, returned HTTP 200 without redirects/retries or classified barriers, and
closed their transports. All remain partial/extracted-unverified with null
contentSuccess. Source/receipt/extraction hashes and inputs are preserved in each
lane. The RFC discovery and selected range have matching body hashes. The two
CTAP body hashes differ from each other and the older outline; no unchanged
whole-document identity or reason for the difference is inferred. New native
section headings identify the selected content. Captures were integrity-only,
never decoded as a source-text fallback.

The GetInfo verifier's original unescaped-Markdown assertion failed offline;
the corrected escaped-heading assertion and original verifier are retained.
No source examples or SDKs were executed, and no actual authenticators or
credentials were accessed. No previously stopped or denied gate was reopened.
