# Pinned source-asset literals

Read explicit data literals from a public JavaScript asset without executing the
asset, loading a page runtime, or adding a parser dependency:

```sh
node dist/scripts/research-asset-literal.js \
  --sha256 AUDITED_DECODED_BODY_SHA256 \
  --range START_BYTE:END_BYTE \
  https://example.com/static/chart.js
```

Build normally before using the compiled command. Supply an independently audited
body hash and actual ranges, not the placeholders. Repeat `--range` for multiple
literals in the same asset; the command still makes **one native GET**. Options
can appear in either order. The URL must be canonical HTTPS ending in `.js` or
`.mjs`, without credentials, query, fragment, whitespace or control characters.
This is explicit source-data research, not automatic subresource discovery.

## Identity and interpretation

The SHA-256 covers the complete **decoded response bytes**, not compressed wire
bytes. Ranges are zero-based UTF-8 byte coordinates, start-inclusive/end-exclusive;
they must be ascending, nonoverlapping and nonempty. The original body and each
selected literal receive separate hashes in the result. A changed body rejects
instead of silently applying stale offsets. Selected ranges must decode as strict
UTF-8; split characters and malformed sequences reject. A BOM is not stripped or
used to shift offsets. This command does not select or infer a text charset.

The response must explicitly declare `text/javascript`, `application/javascript`,
`text/ecmascript` or `application/ecmascript`, optionally with one `charset=utf-8`.
Missing/ambiguous types, HTML, other charsets and other parameters reject. HTTP200
and the exact requested final URL are required. No redirects, retries, cookies,
credentials, script execution or alternate client are used. Native public-address
and TLS checks remain unchanged. Access barriers are failures, not bypass targets.

**A range proves only the syntax of its selected literal.** It does not establish
that the surrounding script executes that value, exports it, displays it, permits
access to related records, or supplies a particular unit. Establish those facts
from the actual source context. No module resolution, transformation, `.map`,
`.filter`, arithmetic or getter is evaluated. For example, a literal containing PR
followed by a separate PR filter still returns the unfiltered literal rows.

## Accepted data and bounds

The dependency-free parser accepts JSON values plus ASCII identifier property
keys, single-quoted strings and trailing commas. String escapes are quotes,
backslash, slash, `b`, `f`, `n`, `r`, `t` and four-hex-digit `u` escapes. It rejects
comments, calls, references, accessors, methods, spreads, sparse arrays, template
strings, unsupported escapes and trailing code. Decoded duplicate keys and
`__proto__`, `prototype`, `constructor` keys reject. No source becomes instructions.

Values retain their types, strings and JS-number semantics; source numeric spelling
is not retained. Nonfinite values and unsafe integers reject. JSON serialization
normalizes negative zero and numeric spellings; this is not exact-decimal math.
Raw U+0000–U+001F string controls reject; escaped controls stay data and are JSON-escaped on
output. Container results are recursively frozen, with null-prototype objects.

- Whole asset:2MB decoded, one request,16KB headers,15-second network timeout.
- One to eight ranges, at most65536 bytes each; parser input at most65536 UTF-16 units.
- Parser root depth0, maximum16;4096 total values/containers;256 entries per container.
- Decoded keys/strings:4096 UTF-16 units; each literal's serialized JSON:65536 UTF-8 bytes.
- Whole API extraction and CLI JSONL:256000 bytes each; wrapper overhead can make
  the CLI reject an API result near the limit. Bounds reject, never truncate.
- Overall CLI deadline:30 seconds, including output acknowledgement. Cancellation
  and output failure close the request transport; caller-owned streams are not ended.

## Programmatic use

`parseSourceLiteral(source)` in `src/source-literal.ts` parses a selected string.
`extractResearchAssetLiterals(input)` in `scripts/research-asset-literal.ts` performs
the pinned offline operation over a complete, already acquired body:

```ts
const extraction = extractResearchAssetLiterals({
  url: "https://example.com/static/chart.js",
  contentType: "text/javascript; charset=utf-8",
  body: capturedDecodedBytes,
  expectedSha256: independentlyAuditedBodyHash,
  ranges: [{ startByte: auditedStart, endByte: auditedEnd }],
});
```

The envelope/ranges must have exact own data fields, without getters, proxies or
extra fields. Byte views are copied using intrinsic state; shared and detached
buffers reject. Caller bytes are unchanged. Only the helper's owned copy is wiped;
this is not whole-heap or caller-buffer erasure. No new request occurs in this API.

`runResearchAssetLiteralCli(args, writable, signal?)` runs the native request and
emits one bounded JSONL record. Successful parsing is `extracted-unverified` with
`contentSuccess:null`; `extraction` has `kind:"script-asset-literals-v1"`,
`partial:true`, `rendered:false`, source identity and each literal value/range/hash.
Failures retain a sanitized category/stage, not raw source or exception messages.
Argument, cancellation and output errors reject; the actual CLI uses exit64 for
bad arguments and exit1 for execution/output failures. This does not modify normal
reader extraction, auto-populate chart metadata, or claim rendered/factual success.

The motivating Bankrate captures and their original static diagnosis remain in
`reports/bankrate-chart-assets-2026-09-16.md`. New feature validation is separate;
the original article and hundred-entry outcomes are not rewritten.
