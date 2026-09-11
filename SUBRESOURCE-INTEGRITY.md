# Bounded subresource-integrity primitives — September 11, 2026

## Scope and interface

`src/subresource-integrity.ts` provides metadata parsing and raw-byte verification
using Node's built-in SHA-256, SHA-384 and SHA-512 implementations. It adds no
dependency, loader integration, requests, CORS decisions or stylesheet behavior.
The parent owns loader/credential/CORS integration; this worker does not remove
the loader's integrity guard.

- `IntegrityAlgorithm` is `"sha256" | "sha384" | "sha512"`.
- `IntegrityMetadata` has readonly `algorithm` and readonly string-array `values`.
- `parseIntegrityMetadata(value)` returns a frozen record and frozen values array
  containing only the strongest supported algorithm's entries, or `null` when
  there are no supported entries. `null` means no effective supported integrity
  restriction, **not** that any digest has been verified.
- `verifyIntegrityMetadata(bytes, metadata, maxBytes)` returns whether the raw
  byte view's base64 digest matches any retained value exactly. It hashes once
  with the selected algorithm. A weaker digest cannot rescue stronger mismatches.
  The caller must handle `null` before calling this non-null verification API.

## Source-derived recovery and explicit representation choices

The existing native extraction
`node_modules/.cache/native-validation/native-stylesheet-integrity-source-september11/sri-canonical/section-1.jsonl`
contains the SRI framework, especially §§3.2, 3.3.1–3.3.4 and 3.5. Its SHA-256 is
`3e8e4382d7b6bfb7467e8dba7abbb5998d6ee2374c24e7df5d5b25f81ea7ace2`.
`STYLESHEET-INTEGRITY-SOURCE.md` retains the original retrieval, failed redirect
attempt and source/integration limitations. Neither historical evidence nor
that report was rewritten.

The implementation follows the extracted parsing recovery rather than rejecting
all author-nonconforming metadata:

1. Split on literal U+0020 spaces. The extracted link is Infra's strict-split,
   not an ASCII-whitespace-splitting algorithm. Leading/repeated/trailing spaces
   produce empty items. Tabs, line breaks, form feed and nonbreaking spaces are
   not silently promoted to delimiters. Multiline metadata is therefore **not**
   normalized to a space-separated list by this primitive.
2. Use the portion before the first `?`. No options are defined in the extracted
   framework, so all option suffixes are ignored, not interpreted as algorithms.
3. Strictly split the expression on `-`: component zero is the algorithm;
   component one, if present, is the digest; otherwise the digest is empty.
   Later dash-separated components are ignored. For example, `sha256-bad-tail`
   retains `bad`, while `sha256--tail` retains an empty digest. A valid digest
   followed by `-tail` still matches under this recovery.
4. Skip unsupported algorithms, but retain malformed or empty digest strings
   under recognized algorithms. `sha512` and `sha512-` still impose a strongest
   SHA-512 restriction with an empty expected digest; they cannot be bypassed by
   appending a valid SHA-256 digest.
5. Retain same-strongest alternatives in source order, including duplicate
   entries. Compare the canonical padded base64 digest **case-sensitively**;
   do not decode, trim, repair padding or translate URL-safe expected values.
   URL-safe `-` is also subject to the actual dash-splitting recovery; `_` stays
   literal. This is not an implementation of a different browser's SRI recovery.

The saved response body was also inspected locally for the §2 definitions:
`sri-canonical/response-1.body`, SHA-256
`d6eacb528f89ca8df9b0f6ae602490e102cb3d98ee87c5a9bffb164b4fb5d4ff`.
It defines base64 encoding by RFC 4648 §4 and a valid algorithm token through
its ASCII-lowercase spelling. Thus mixed-case algorithm names are recognized and
canonicalized to this API's lowercase union before strength ranking. The
extracted pseudocode does not separately spell out that canonicalization before
indexing its lowercase token set; this is an explicit native representation
choice. Digest strings are never case-folded. No new fetch or native source
extraction was run for these checks.

## Bounds, byte ownership and invalid input

`subresourceIntegrityLimits` is frozen and exposes `metadataCodeUnits: 16384`
and `metadataItems: 128`. Parsing checks the entire input string before ignoring
unknown algorithms/options. Every strict-split item, even empty or unsupported,
counts toward the item cap. These are native resource restrictions, not limits
claimed to come from the standard.

Verification requires a nonnegative safe-integer `maxBytes`, an actual
`Uint8Array` (including Buffer subviews), and a metadata record with own data
properties: a canonical algorithm and a nonempty string array. Array holes,
accessors and proxies are rejected without invoking their traps. All values are
validated before accepting any match. Directly supplied normalized metadata is
bounded to 128 values and 16,384 stored code units, counting the algorithm once
plus all value strings. These normalized-storage bounds differ from counting the
original source's separators/options; every parser-produced record fits them.

Native typed-array getters recover the real buffer, offset and length, so
shadowed public properties cannot bypass the byte ceiling. Detached views and
non-byte arrays are rejected before hashing. Only the view's bytes are hashed;
the underlying buffer outside that view is not included. Inputs are not mutated
or decoded as text. UTF-8, invalid byte sequences, a BOM, CRLF and non-ASCII bytes
remain digest-significant. Callers must keep shared memory stable while verifying.

Bad public argument shapes throw `AgentBrowserError` with `invalid-input`;
metadata/item/byte overages throw `resource-limit`. A well-formed call with a
nonmatching digest returns `false`, including recognized empty/bad digests.
Malformed arguments do not escape as incidental cryptographic API errors.

## Integration and standards gaps

This API only implements a bounded supplied-byte/metadata operation. It does not
choose Fetch eligibility, CORS mode, credential policy, redirect treatment,
response exposure, encoded versus content-decoded transport stage, or the point
before text/charset/BOM decoding at which the loader supplies bytes. The parent
must enforce eligibility and its existing stylesheet-byte ceiling first.

The selected framework's author grammar, strict-split recovery and referenced
definitions do not establish comprehensive current-browser interoperability.
The report's detailed external Infra/CSP/Fetch grammar and eligibility gaps
remain; local inspection did not fetch those specifications. Integrity-Policy,
reporting, violation events and other subresource integrations are not added.
This is not a claim of integrated stylesheet SRI/CORS support or site acceptance.

## Native validation and retained failures

New lane:
`node_modules/.cache/native-validation/subresource-integrity-worker-september11/`.
Clean snapshot baseline: `372e8a3d9e94f3d0c30b09cbb49606bda84adc9e`.
Only the two new owned TypeScript files are overlaid. The archived native test
manifest receives only `src/subresource-integrity.test.ts`; the dirty shared
manifest and all unrelated dirty code are excluded from the snapshot.

The explicit selected suite is `src/subresource-integrity.test.ts`:

- `baseline-missing`: exit 1, one failed collection, zero executed tests because
  the new implementation did not yet exist. The import failure, source pins and
  exact `baseline-test.ts` are retained.
- `implementation-first`: **95 passed / 0 failed**; strict compilation passes.
- `shapes-first`: **96 passed / 1 failed**, exposing a revoked-array-proxy guard
  order that leaked a generic TypeError. The failure is retained. The production
  guard now rejects proxies before `Array.isArray`; no other file was needed.
- `shapes-second` and `tests-final`: **97 passed / 0 failed**.
- Final UTC on September 11, 2026: tests **16:53:56.145–16:53:56.664**;
  strict no-emit compilation **16:53:56.702–16:53:57.395**, no diagnostics;
  existing Biome formatting **16:53:57.433–16:53:57.473**, exit zero.

Coverage includes fixed SHA-256/384/512 vectors, unknown/empty/malformed metadata,
all algorithm-strength permutations, multiple alternatives, options, exact
recovery, URL-safe and case/padding non-normalization, tampering, raw non-ASCII/
BOM/CRLF bytes, subviews/no mutation, and exact/over-limit metadata, item and byte
boundaries. Public-shape tests include holes, detached views, shadowed byte
properties, accessors and revoked proxies.

Vitest uses the existing native guard, one thread worker, no fork pool and the
explicit one-file manifest selection. Tool-child seccomp denies sockets, with
private HOME/TMP, stripped environment, ignored stdin, 120-second timeout plus
5-second kill grace, 6 MiB output/file caps, source-before/after pins and process-
group cleanup checks. `AUDIT.json` records clean tracked isolation, the exact
manifest addition and identical final validated inputs. `source-final.sha256`
pins the two new files and this document; `scoped-final.patch` retains the patch.
No live requests, SafeJS, devices, credentials, new dependencies or commits were
used. The parent owns independent review, loader integration and the wider gate.
