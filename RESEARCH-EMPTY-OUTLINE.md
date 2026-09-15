# Explicit selection after an empty heading outline

A complete page can contain useful text without any headings. The long-document
research workflow deliberately reports `empty-extraction` when its heading
outline is empty. That historical result is not rewritten, and ordinary replay
still refuses to treat it as an already successful extraction.

For an independently pinned complete long HTML capture, a host can explicitly
select a node using the empty-outline recovery path:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile long-v1 \
  --receipt-sha256 "$HOST_RECEIPT_SHA256" \
  --body-sha256 "$HOST_BODY_SHA256" \
  --body-bytes "$HOST_BODY_BYTES" \
  --recover-empty-outline --selector body --format markdown < receipt.jsonl
```

The pins are supplied by the supervising host's capture verification, not by page
instructions. No receipt field, response header or URL enables recovery by itself.
The CLI requires `long-v1` and one explicit CSS selector. Section, heading, link,
text-find and line modes are rejected, as is combining the two recovery flags.
Existing JSON/Markdown and table-option rules remain. Invalid arguments reject
before input consumption; execution performs no HTTP or automatic retry.

## Host API and admission

`validateResearchEmptyOutlineAdmission` in
`scripts/research-admission-evidence.ts` is separate from generic admission.
It requires a complete independently pinned long HTML body, matching successful
primary/navigation/body identities, closed metrics, an inert native reader and
clean classification. The original outcome must be `empty-extraction` with
`contentSuccess: false`, one heading-outline selection and a finite empty,
nontruncated outline tied to that navigation's document. Failed, rate-limited,
output-omitted, partial-body or otherwise mismatched evidence is not admitted.

`recoverResearchEmptyOutlineSelector` in `scripts/research-json-replay.ts` follows
the existing selector recovery overload pattern: receipt bytes, trusted pins,
`{ selector, ...tableOptions }`, optional signal, and optional explicit format.
Default format is JSON. The helper reparses using the original reader policies,
performs existing source/selected-content barrier checks, and independently
rechecks that the native heading outline is empty and nontruncated. A forged
empty outline over a source containing discoverable headings cannot recover.

Selection must match exactly one node. Existing parser/reader work and20-second
between-phase checkpoints remain, together with the256,000-byte extraction and
327,680-byte serialized replay limits. These are not synchronous preemption;
supervisors still enforce an outer deadline. Owned decoded bytes are cleared and
the native tree closes on success or failure; caller receipt bytes are preserved.

## Truthful result

The result keeps the normal partial, unverified replay contract and adds:

```json
{
  "kind": "captured-empty-outline-selector",
  "originalOutcome": "empty-extraction",
  "originalContentSuccess": false,
  "originalRequestRetried": false,
  "originalDiscovery": {
    "method": "heading-outline",
    "entries": 0,
    "truncated": false,
    "scannedNodes": 2758
  }
}
```

This object is the report's `recovery` field, not a replacement source receipt;
the scan count shown is illustrative. Empty selected content still reports
`empty-extraction`, and detected barriers remain barriers. This does not claim
full-page rendering, source factual accuracy, interaction or script support.
Generic replay and the separate output-limit recovery retain their prior gates.
Incomplete network prefixes from `RESPONSE-PREFIX.md` remain inadmissible.

## Saved-source validation

The September15 Google Play capture yields27,716 UTF-8 bytes of catalogue
Markdown through both the API and actual CLI, with identical content hashes and
no refetch. Ordinary replay still rejects the unchanged original receipt. Three
other long captures retain their previous ordinary content hashes and reject the
new empty-outline path; a default-profile capture also rejects it. See
`reports/empty-outline-recovery-2026-09-15.md` for native tests, negative controls,
source/CLI evidence and the remaining website/interaction limitations.
