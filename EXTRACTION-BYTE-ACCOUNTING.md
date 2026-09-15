# Allocation-free extraction byte accounting

The native extractor counts UTF-8 bytes without first allocating encoded byte
arrays. `src/utf8-byte-length.ts` provides the internal string helper used by
`src/extraction.ts` for Markdown lines, serialized intermediate nodes, final
results, discovery envelopes and source-companion property overhead.

This is an implementation optimization, not a new extraction option. Output,
metadata, node/depth limits, intermediate limits and serialized UTF-8 byte caps
retain their existing meaning. No runtime dependency, Node Buffer requirement,
page script execution or SafeJS behavior is added.

## String contract

`utf8ByteLength(value: string)` returns the length that
`new TextEncoder().encode(value).byteLength` would return:

- ASCII code units contribute one byte, including controls.
- Other code units below U+0800 contribute two bytes.
- Remaining non-surrogate BMP characters contribute three bytes.
- A valid adjacent high/low surrogate pair contributes four bytes.
- An unpaired surrogate contributes three bytes, matching replacement encoding.

The helper scans an immutable string in linear time with constant additional
space. It neither normalizes text nor escapes JSON. Callers still serialize JSON
first when the budget applies to a JSON envelope, so quotes, backslashes,
controls and JSON's lone-surrogate escapes remain correctly charged.
Its internal typed contract is a string; it is not a general coercion API.

## Scope and verification

The optimization removes temporary encoded arrays from the extractor's own
length checks. It does not remove all extraction allocations: JSON strings,
extracted trees, Markdown pieces and source-companion/fallback helpers still
have their own work and allocations. Other modules' encoding is unchanged.

Native regressions compare the helper with TextEncoder across all 65,536 single
UTF-16 code units, boundary pairs, deterministic mixed strings and long inputs.
Integration checks retain exact serialized caps, Unicode table output, explicit
prefix fallback and structural failures; spies confirm ordinary Markdown/JSON
accounting does not call TextEncoder encoding methods.

Ten saved website pages supply equal-output comparisons, including product,
access, table and GitHub source-code metadata. Local same-tree timings exclude
network, load and startup; they do not establish end-to-end browser performance.
See `reports/extraction-byte-accounting-2026-09-15.md` for measurements and limits.
