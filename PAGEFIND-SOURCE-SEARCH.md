# Captured Pagefind source search

The standalone native browser can retrieve source-advertised Pagefind assets.
`research-pagefind` queries those saved bytes and includes supplied result-fragment
text without executing downloaded JavaScript or WASM. It does not open a browser,
fetch missing chunks, solve access challenges, or invoke SafeJS.

## Run

After building, supply a SHA256-pinned UTF-8 JSON bundle on stdin:

```sh
node dist/scripts/research-pagefind.js \
  --sha256 "$BUNDLE_SHA256" --term rebas --limit 1 < captured-bundle.json
```

The exact bundle schema is:

```json
{
  "version": 1,
  "metadata": {
    "url": "https://source.example/pagefind/pagefind.en_meta.pf_meta",
    "data": "BASE64_OF_COMPLETE_CAPTURED_BODY"
  },
  "chunks": [{
    "hash": "en_index",
    "url": "https://source.example/pagefind/index/en_index.pf_index",
    "data": "BASE64_OF_COMPLETE_CAPTURED_BODY"
  }],
  "fragments": [{
    "hash": "en_fragment",
    "url": "https://source.example/pagefind/fragment/en_fragment.pf_fragment",
    "data": "BASE64_OF_COMPLETE_CAPTURED_BODY"
  }]
}
```

These are illustrative identifiers, not discovery instructions or tested URLs.
Use actual captured metadata and its source-derived asset hashes. `data` is the
canonical base64 body after HTTP transport decoding, before Pagefind's own gzip
and `pagefind_dcd` envelope decoding. The `fragments` array may be empty. Input
JSON rejects duplicate keys and undeclared bundle/asset fields. The SHA256 pin
identifies exact bundle bytes; neither it nor an asset filename proves publisher
authenticity, HTTP success, deployment consistency, or current content.

## Query behavior

- Supports the observed Pagefind **1.5.2** metadata and posting schemas only.
- Matches exact stored term strings and exact stored variant strings, unions
  their document memberships, and intersects across requested terms.
- Does not lowercase, tokenize, stem, fold diacritics, or search substrings.
  `rebase` and the stored term `rebas` are different inputs.
- Accumulates document deltas independently for each posting list; validates all
  supplied records, including records not used by the query. Signed position and
  weight arrays are validated as integers but not interpreted or ranked.
- Returns document-ID order, not the website's relevance order. Results are
  explicitly `unverified`, and scope is only `supplied-chunks`. A missing term
  means absent from those chunks, not absent from the whole website.
- Includes a fragment's original URL string, title and content only when its hash
  matches a returned document and its word count agrees with metadata. This is
  indexed source text, not rendered DOM, live navigation or factual verification.
  Unsupplied fragments remain hash-only results; no hidden requests are made.

The pure TypeScript `searchPagefindSource` API in `src/source-pagefind.ts` accepts
already envelope-decoded CBOR bytes. Its independent `source-cbor` codec does not
use or enlarge the authentication/CTAP decoder's limits. The Node CLI handles
gzip, source identity and bounded stdin/stdout using existing built-in facilities.
No page-runtime dependency was added.

## Bounds and limitations

Stdin, aggregate captured body bytes, and aggregate unwrapped payload bytes are
each capped at 2,000,000. At most 16 index chunks, 100 supplied fragments and 32
distinct query terms are accepted. Terms are at most 256 UTF-16 units. Output is
capped at 256,000 bytes; the result limit defaults to 20 and can be 1–100. Excess
output fails explicitly rather than silently truncating fragment content. The
CLI has a 30-second input/output deadline and cancellation cleanup. Individual
synchronous gzip/JSON operations are bounded, not independently preemptible.

The CBOR codec accepts canonical definite integers, strings, arrays, maps,
booleans and null. It rejects tags, floats, indefinite forms, duplicate scalar
map keys, malformed UTF-8 and trailing bytes. Per-value bounds include depth64,
100,000 decoded values, 50,000 container entries and 1,000,000 string bytes.
Gzip integrity uses Node's built-in decoder, including its concatenated-member
and padding behavior; unwrapped CBOR/JSON must still be one complete value.

This feature does not implement live Pagefind UI parity, general binary search
formats, search discovery, automatic chunk acquisition, snippets, anchors,
filters, language selection, relevance ranking, cross-site navigation or dynamic
page execution. Broader website, performance, SafeJS, authentication, passkey and
access-challenge acceptance remain separate work.
