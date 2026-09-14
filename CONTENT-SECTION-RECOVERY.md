# Recover content from an output-limited capture

September14,2026: implemented and validated with729 targeted native tests,
production compilation, strict checks for eight selected test roots, and one
fresh Wikipedia request followed by three socket-denied offline CLI reads.
This does not establish the full native release, rendering or interaction gates.

## Usage

After capturing a reader page with `research-browser --reader --capture-body`,
preserve its original single JSONL receipt. For a typed extraction-output quota
failure, explicitly select one heading:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" \
  --body-sha256 "$BODY_SHA256" --body-bytes "$BODY_BYTES" \
  --recover-output-limit --section 'h2#Evaluation' < receipt.jsonl
```

Pins must come from the retained, trusted observation: the receipt hash covers
its exact bytes, including any final newline; the body hash and size cover the
decoded captured response bytes. Do not merely trust hash fields supplied in an
untrusted receipt. Output is native structured JSON, optionally with
`--table-metadata`. The API is `recoverResearchOutputLimitSection` in
`scripts/research-json-replay.ts`, accepting the receipt, trusted pins and
`{ section, tableMetadata? }`.

This mode does not retry the original URL, enlarge quotas, truncate content, or
turn a failed whole-page observation into a successful one. Its `recovery` record
preserves the original failure and explicitly says `originalRequestRetried:false`.
The extracted section remains partial and unverified until its content is checked.

## Boundaries

- Ordinary successful-capture replay still rejects failed receipts.
- Recovery requires the default native reader profile, scripts/styles disabled,
  a committed document, closed/inactive transport, HTTP2xx HTML, independently
  pinned full captured bytes, and no recorded challenge or rate-limit envelope.
- Only an extraction-stage resource limit with valid `extraction.output` byte
  measurements is admitted. Legacy untyped failures, parser/network errors,
  restrictions, incomplete captures and `long-v1` are rejected.
- Selection must match one genuine heading. No whole-body, link-search or
  selector fallback; oversized sections still fail at the existing caps.
- Decoded content is checked again for challenges. Owned decoded bytes are
  cleared and document state closes on success and failure.

## Fresh content validation

The18:00UTC native reader request to Wikipedia's large-language-model article
returns HTTP200 and1,071,612 decoded bytes. Whole-page Markdown stops at a
256,000-byte quota with observed256,021 bytes. From that exact new failed receipt,
the explicit CLI extracts History, Evaluation and Limitations and challenges:
29,444,26,268 and18,857 JSONL bytes respectively, including report metadata.
These are not comparable to earlier Markdown-only section measurements.

All three commands execute with socket syscalls denied, report zero network
requests, retain the original failure/hash identities, and pass topic-marker
checks. The original receipt is unchanged. The earlier17:29 Wikipedia receipt
remains historical and untyped; it is not retroactively admitted or rewritten.

The same live batch retrieves Stanford's static HELM announcement and the
llama.cpp build document, following a real link from the preceding GitHub README
capture. See `WEBSITE-TEST-INVENTORY-SEPTEMBER-14-THIRTIETH-UPDATE.md`.

## Native validation and limitations

- API red:66 failures and1 pass; CLI red:3 failures and100 passes. Final API
  tests:328 passes. Parent isolated candidate:729 passes across eight exact
  manifest entries, with socket-denying containment and network-call guards.
- Initial API green attempt retains three existing5second test-timeout failures
  and one corrected challenge-fixture expectation. Final validation uses a
 60second test-harness timeout; production deadlines are not increased.
- Strict selected test-root checking finds a missing `maxChanges` in the prior
  output-limit regression fixture. Adding its existing1024 default repairs that
  type error; all eight roots then typecheck and the affected196 tests pass again.
- Production compilation and formatting/whitespace checks pass. The previously
  existing CLI control-character-regex lint errors are not changed. No full
  native release rerun, SafeJS execution, credentials, devices or visual gate.

The isolated runtime derives from the audited5c7a882 source snapshot, overlays
the committed576acf5 diagnostics and this recovery patch, and excludes unrelated
dirty root work. Source/compiled identities, logs and live receipts are retained
in `node_modules/.cache/native-validation/section-recovery-september14/` and
`node_modules/.cache/native-validation/recovery-live-september14/`. The earlier
research-source batch stays pinned to5c7a882 in
`node_modules/.cache/native-validation/content-research-september14/`.
