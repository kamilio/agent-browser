# Discover sections in an output-limited capture

September14,2026. An oversized page can now yield its native heading outline
without another request. This lets the agent choose a real section instead of
guessing a selector or reading the entire captured HTML into its context.

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 "$RECEIPT_SHA256" \
  --body-sha256 "$BODY_SHA256" --body-bytes "$BODY_BYTES" \
  --recover-output-limit --headings < receipt.jsonl
```

Use a returned `headings.entries[].selector` with the existing `--section` recovery
command and the same original receipt/pins. Native selectors may be structural
`nth-child` paths; do not replace them with guessed IDs. A selector can be null
when a native selector cannot be represented. Pins still cover the exact retained
receipt bytes and independently checked decoded body, not untrusted hash claims.

The API is `outlineResearchOutputLimitCapture(rawReceipt, trusted, signal?)`.
Output has `selection.method:"heading-outline"` and
`recovery.kind:"captured-output-limit-outline"`, distinct from section extraction.
It retains original failure metadata and records zero network requests. Ordinary
replay does not acquire a headings mode or begin accepting failed observations.

## Limits and semantics

The existing strict default-profile failed-capture admission remains unchanged:
complete pinned source, typed extraction-output quota failure, committed native
reader document, closed transport, HTTP2xx HTML and no recorded access barrier or
rate limit. Actual reconstructed document and outline text are classified again.
No scripts, styles, SafeJS, network fallback or larger output allowance is added.

Native heading limits remain256entries,256title code units,4096selector code
units,50,000nodes,128depth and256,000extraction bytes. Replay retains its existing
327,680-byte final-output and20second execution bounds. Truncation is reported;
an empty outline remains empty rather than falling back to whole-document text.
Table metadata is not accepted with outlines. Bodies clear and documents close
on both successful and failed paths.

## GitLab evidence

The21:27 native visit to GitLab's CI/CD YAML reference retrieves649,631 decoded
bytes but hits the256,000-byte Markdown cap at observed256,102 bytes. From that
same failed receipt, the new CLI discovers **175 headings without truncation**
in44,856 JSONL bytes. Its actual returned selectors then recover:

| Section | JSONL bytes, including metadata | Checked content |
| --- | ---: | --- |
| `script` |10,667|Command explanation and `bundle exec rspec` example|
| `needs` |130,594|Parallel job execution discussion|
| `variables` |89,558|Variable and job configuration discussion|

There is only one original website request. The outline and all three section
commands execute with socket syscalls denied; original receipt/failure identities
are unchanged. Full-page failure is not relabeled as full-page success.

## Validation

- 630 native tests pass across eight explicitly manifested files. Production
 compilation and strict checks for eight selected test roots pass;203 affected
 API/CLI cases are repeated after final test-only type/format corrections.
- Red:13failures/190passes. Initial green identifies two new fixture assumptions
 about ID selectors; the corrected integration uses the actual structural
 selector to recover and verify content. Cancellation, challenge checks, empty
 output, truncation, rejection and owner cleanup remain covered.
- The first offline supervisor cannot spawn its child inside socket-denying
 isolation; a minimal probe confirms EPERM. The resumed arrangement isolates the
 CLI child itself. A guessed content marker is corrected using the already-saved
 successful section result, without rerunning that command or refetching.
- Formatting and whitespace pass. Scoped lint retains the two pre-existing CLI
 control-character-regex errors. No full native release or visual/runtime gate
 is claimed.

Evidence is in `node_modules/.cache/native-validation/recovery-outline-september14/`
and `node_modules/.cache/native-validation/docs-forum-september14/`. The browser
visit uses185415f; offline CLI validation uses its isolated source plus the four
owned outline files. Original source, compiled inputs, logs and preparation
failures are retained separately.

A parallel native-only investigation of earlier serializer test timeouts finds
assertion/GC overhead, not a production serialization hotspot: three synthetic
runs measure large-receipt serialization medians17.6–34.5ms. No speculative code
change is made. Exact scope and failed-default-timeout evidence remain in
`node_modules/.cache/native-validation/replay-performance-september14/SUMMARY.md`.
