# Re-extract a saved native-first capture

The research replay CLI can explicitly preserve a saved native-first loading
strategy while selecting more focused content, without another network request:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --expected-document-strategy native-reader-fallback-v1 \
  --receipt-sha256 "$RECEIPT_SHA256" \
  --body-sha256 "$BODY_SHA256" \
  --body-bytes "$BODY_BYTES" \
  --content-focus main-content-v3 \
  --format markdown < capture.jsonl
```

Obtain the receipt and body pins from the trusted capture workflow. A matching
hash establishes byte identity with that trusted input, not the publisher's
accuracy or general authenticity of arbitrarily supplied metadata.

## Admission and loading

The opt-in accepts complete, successful default-profile HTML captures with a
coherent `documentStrategy` record. Missing or contradictory classifications,
empty/malformed captured extraction, missing pins, incomplete bodies, failure,
rate-limit/backoff and barrier evidence are not silently converted into success.
Native-mode captures retain their native profile; reader-mode captures must
retain the fixed raw/visibility/encoding policies and matching reader metadata.

Replay recomputes the native-first strategy on the same captured body with the
original default document limits. The actual mode and native failure diagnostic
must match the capture. A changed runtime that chooses a different mode does not
silently reinterpret the old capture. Native CSS behavior remains native; a
native capture is not forced through the reader to make selection easier.

No transport, page scripts, SDK, images or external stylesheets are enabled.
Reader fallback retains the independent unfiltered source-barrier check, and
the selected document is classified again before content is returned. Owned
decoded bytes and selected/diagnostic documents are cleaned up on success,
failure or cancellation; caller-owned receipt bytes remain unchanged.

## Supported selections

Use one ordinary `--selector`, `--section`, `--content-focus` or `--links`
selection. Existing JSON/Markdown and table-option compatibility still applies.
The strategy path does not accept long-document mode, recovery flags, heading
discovery, literal text/JSON-pointer selection, MIME overrides, text-prefix or
source-label interpretation overrides. Those are explicit errors, not ignored
options. A CSS selection can omit the article headline; consult the extraction's
title metadata and choose the selection appropriate to the task.

Existing untagged replay behavior is unchanged. Strategy captures without the
explicit expected-strategy flag remain unsupported. The synchronous
`extractResearchReplayJson` API does not reinterpret strategy captures, even
with the new trust field; use the asynchronous
`extractResearchStrategyReplayJson` API for them.

## Provenance and limits

Results retain `source.documentStrategy` and `source.capturedOutcome` from the
capture and report the revalidated `documentStrategy`. Selection describes the
new extraction intent, not a changed historical capture. `networkRequests` is
zero; content remains partial and unverified rather than a factual or rendered
page guarantee. Reader metadata describes the selected reader, when applicable.

Focused output may still contain ancillary material or fall back to the document
when landmarks are ambiguous. Successful extraction is not proof of a complete
article, safe purchase, medical/financial claim, interactive workflow or CAPTCHA
solution. See `TASKS.md` and the dated strategy-replay validation report for
measured coverage and remaining gates.
