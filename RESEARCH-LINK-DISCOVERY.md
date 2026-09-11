# Bounded link discovery from native documents

Full-page JSON is a poor way to discover a few navigation targets. The September
11 NVIDIA product-index capture loaded successfully, but whole-body replay hit
the 256,000-byte extraction ceiling. A later `a[href*="dgx"]` replay also failed
because ordinary selector replay requires exactly one element. Neither failure
is relabeled as success or retried over the network.

## API

```ts
const result = extractResearchReplayJson(
  receiptBytes,
  trustedCapturePins,
  { links: "dgx" },
  signal,
);
```

This is a third, explicit selection mode in `scripts/research-json-replay.ts`.
It cannot be combined with `selector`, `section` or `tableMetadata`. Existing
selector/section modes still require exactly one match. Capture admission,
body/receipt pins, reader raw-policy validation and document limits are unchanged.
Failed or blocked receipts remain ineligible. This is a programmatic API, not a
new command-line flag or an automatic navigation/fallback mechanism.

For an already loaded native document, `discoverDocumentLinks(tree, query,
options?)` is exported from `src/extraction.ts`.

The query is a literal, case-insensitive substring of the resolved URL, not a
CSS selector or a search over page text. It must be nonempty, at most 256 UTF-16
code units, and contain no ASCII whitespace, control characters or DEL. Search
serialized URLs: percent-encoded path/query components are not decoded guesses.

## Output and limits

The replay report sets `selection.method` to `link-url-search`, includes `links`,
and does not include an ordinary `extraction` tree. `links.entries` contains native
`ref`, resolved `url`, bounded `label` and `labelTruncated` values. Labels are
visible-text prefixes, not computed accessible names. `selection.matches` counts
returned entries; it is not a total-match claim when `links.truncated` is true.
Replay references identify nodes in the captured document, which closes when the
call finishes; they are evidence references, not live handles in another session.

- Default discovery retains at most 32 links and 256 code units of label text.
- Raw and resolved URLs are capped at 4,096 code units. Invalid, credential-bearing
  and non-HTTP(S) destinations are omitted. A URL is never clipped into a different
  navigation target. Links are not deduplicated or automatically followed.
- The collector makes one bounded traversal, retaining bounded label prefixes
  rather than serializing the whole page or repeatedly reading entire subtrees.
- Default traversal limits are 50,000 nodes and 128 levels. Entry overflow returns
  explicit truncation; traversal and byte-budget exhaustion remain errors.
- Whole-document parsing, replay extraction/output ceilings, abort handling and
  the monotonic replay deadline remain in force. Discovery checks the deadline
  during traversal, not only before and after the phase.

Discovery shares the native extraction visibility/omission policy. The reader's
document is a sanitized subset; its visibility and scripting limitations are
still reported, not treated as full rendered-browser behavior. Relative links
resolve against the loaded document's base URL. For replay, that URL comes from
the reported/redacted receipt: a target inheriting a redacted source query must
not be mistaken for a recovered original URL.

Whole-document and selected-label challenge screening remain in force. Empty
results use `empty-extraction`; nonempty results remain `extracted-unverified`
with `contentSuccess: null`. Neither link discovery nor pin verification proves
that a destination is trustworthy, reachable or free of access restrictions.
Any later navigation still uses the caller's existing authorization scope and
normal network-policy checks; discovery itself never navigates.

## Validation

The isolated run on September 11, 2026 spans
**06:22:03.482Z–06:23:13.482Z UTC**. Production build, strict checking of 32 selected
test roots, scoped lint of six TypeScript files and **3,416/3,416** tests across 32
explicit native-manifest files pass. The three new files contribute 129 tests:
43 collector, 37 document-discovery and 49 replay-integration cases. All 3,060 names/outcomes from
the prior rate-limit selection match; four additional existing extraction/heading
files also pass. All 995 isolated source inputs remain unchanged. Evidence:
`node_modules/.cache/native-validation/native-link-discovery-september11/`.

A separately scoped zero-network native capture check runs at
**06:23:53.562Z–06:23:53.736Z UTC**, exit0. The new `{links:"dgx"}` mode returns
**16 links**, not truncated, scanning 6,299 nodes and emitting 3,979 JSONL bytes.
It finds the observed DGX Spark workstations route; no destination is visited by
this check. Source metadata remains `extracted-unverified`, not verified product
content. The original full-body and multi-selector failures remain unchanged.
Evidence: `node_modules/.cache/native-validation/native-nvidia-link-discovery-september11/`.

The original 317,080-byte body SHA-256 is
`aaf5aedb54ce42441332185f6ff3ecfdc8d590c311de4473a291e787e6da8cf9`;
receipt SHA-256 is
`41e8792cfc9f34315192c706b5234e9bb46cfc724676de12b9e7fb0fc1474bf4`.
The new links JSONL SHA-256 is
`e924f399327f02ab8e82ef3439537cc12cb2dc48df1cbdc030e4e6cf95cbfbd4`.
The 995 source and 1,784 compiled inputs remain unchanged before/after the check;
network guard attempts are zero. Caller receipt storage was cleared; internal
document/body cleanup is additionally covered by the synthetic tests, not asserted
as a separately inspected heap property by this harness.

These are selected native tests and a cached-page feature check, not a full-suite
run, fresh product-page validation, OS sandbox, throughput benchmark or broader
runtime gate. Known unrelated selector-suite failures remain outside this scope.
This feature does not implement SVG tree construction, relax malformed-attribute
parsing, resolve the WHATWG reader-depth failure, solve CAPTCHAs or complete the
four-topic research.
The subsequent observed product-page visit is recorded separately in
WEBSITE-FLOWS-SEPTEMBER-11.md, not folded into the cached-page proof.
