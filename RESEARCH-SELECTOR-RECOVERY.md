# Explicit subtree recovery after an output limit

The native replay CLI now accepts `--recover-output-limit --selector CSS` for
an eligible pinned HTML capture. This retrieves one source subtree when a large
page's repeated lists overwhelm whole-page extraction and heading sections do
not isolate the wanted introduction. It does not refetch or raise any limit.

## Usage

After building the selected checkout, pass host-verified receipt/body pins and
a selector inspected from that captured source:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" \
  --body-sha256 "$BODY_SHA256" --body-bytes "$BODY_BYTES" \
  --recover-output-limit \
  --selector 'div.project-description__content' \
  --format markdown < authorized-receipt.jsonl
```

The selector above belongs to the saved PyPI NumPy response from September 15,
2026; it is not a universal content selector. Exactly one source element must
match. Use quoted attribute selectors for IDs that contain CSS punctuation,
for example `section[id="section-10.2.3"]` in the saved RFC 9110 document.
There is no automatic selector guessing or fallback from ordinary replay.

The script API exports `recoverResearchOutputLimitSelector(rawReceipt, trusted,
selection, signal?, format?)`. Selection contains `selector` and optional
`tableMetadata`/`tableRows`, with the same format restrictions as normal subtree
extraction. JSON is the default; Markdown table rows require explicit Markdown,
and table metadata remains JSON-only.

## Preserved boundaries

- Admission still requires the pinned default-profile native semantic-reader
  HTML capture of a completed document navigation that failed specifically at
  `extraction.output`. Network, loader, HTTP, challenge and unrelated failures
  do not become recoverable, and arbitrary failed receipts stay evidence-only.
- Original failure, receipt/body identity and `originalRequestRetried:false`
  remain in the result. Recovery has the distinct kind
  `captured-output-limit-selector`; section and outline kinds remain unchanged.
- Recovery stays partial and unverified. Nonempty content has
  `contentSuccess:null`; empty content and reclassified barriers do not become
  success. Document and selected-content challenge checks still apply.
- Existing selector, extraction, node/depth, receipt, output and timeout limits
  apply. A whole-body selector that still exceeds 256 KB is rejected. There is
  no JavaScript execution, alternate HTTP client, credential use or network retry.
- Source documents close and admitted body copies are cleared on success or
  failure. Caller-owned original receipt/body bytes are unchanged.

## Evidence

The live PyPI response contained 754,398 decoded HTML bytes. Whole-page output
failed at 256,030 bytes; its inner introduction h1 also produced an oversized
heading section. File metadata dominates the captured source. Selecting the
description now yields **3,803 Markdown bytes** of introductory content without
the download/history panels. The existing parser already had this content; the
new capability is explicit admission and CLI access to its bounded subtree.

The saved RFC 9110 response contained 1,187,554 bytes and also exceeded whole-page
output. Explicit selector recovery of its Retry-After section yields **1,719
Markdown bytes**, matching existing heading recovery. Actual CLI output matches
the new API and direct baseline native extraction of each selected subtree.
PyPI JSON structure also matches after removing document-local node references
for comparison; its 9,748-byte normalized size is not a wire-receipt byte count.

The baseline CLI rejects selector recovery; the final CLI admits only the new
explicit combination. Oversized whole-body selection and ordinary failed replay
remain rejected. All **1,312 selected tests** pass across 18 explicit native
files, 80 more cases net than baseline. All 1,227 unchanged case statuses match;
five prior CLI admission cases were revised/reworded for this intentional feature.
Build/types/format/lint pass. Independent static review found no concrete defect.

Fourteen guarded offline children include the unsuccessful existing PyPI heading
attempt, expected rejection controls, and a preserved invalid dotted-ID recipe
followed by a corrected selector. All close with zero network attempts. Initial
test-only type/Markdown-escaping mistakes remain recorded separately; production
bytes did not change between the initial and final candidates.

See `reports/diverse-content-2026-09-15.md` for all twelve new public URLs and
`reports/diverse-content-2026-09-15.json` for measurements. Original website
failures are not rewritten into successes. Full rendering, interactions, runtime,
credential/passkey, service/socket and TTY acceptance remain separate open gates.
