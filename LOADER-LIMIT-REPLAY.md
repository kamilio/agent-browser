# Recover complete captures after loader limits

A native page load can fail on a parser or reader budget while its complete
response body is already saved. After a parser improvement, the existing replay
CLI can explicitly try that same artifact again without accessing the website:

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile default \
  --receipt-sha256 RECEIPT_SHA256 \
  --body-sha256 BODY_SHA256 \
  --body-bytes DECODED_BODY_BYTES \
  --content-focus main-content-v3 \
  --recover-loader-limit \
  --format markdown \
  --output-limit-policy text-prefix-v1 < capture.jsonl
```

The receipt hash covers the exact input bytes, including whitespace. The body
hash and byte count cover the complete transport-decoded body in the capture.
Use recorded evidence, not guessed pins. This command does not fetch a URL.

## Explicit recovery contract

Ordinary replay still treats failed captures as evidence only. The new flag
admits only a complete, independently pinned, default-profile 2xx `text/html`
capture whose native semantic reader failed with `resource-limit` at `loader`.
The original transport must be closed and inactive. Captured barriers, rate or
service backoff, omitted/incomplete bodies, strategy captures, other failure
stages and contradictory completed document results remain rejected.

The replay uses the current native loader with unchanged node, depth, text,
extraction, output and timeout limits. It may still fail on those limits. Source
and selected-content challenge classification still runs; this is not a CAPTCHA
solver, authentication bypass or network retry. No website code or SafeJS runs.

Results retain a separate `recovery` record with kind `captured-loader-limit`,
the original failure, `originalContentSuccess: false`, and
`originalRequestRetried: false`. The original receipt and its field presence are
not rewritten, and missing navigation/reader results are not invented. Reported
query redaction stays intact; replay does not reconstruct hidden query values.
Captured UTF-8 fallback and source-heading policies are honored even when the
failed load never produced a reader. They describe requested interpretation,
not an invented earlier encoding observation. Ordinary replay stays strict.

## Selection and output

Choose one CSS selector, heading section or content-focus policy. JSON and
Markdown retain their existing constraints. This mode does not accept headings,
links, find/lines discovery, long-profile capture, strategy replay, MIME repair,
source-link-label overrides or another recovery flag.

Markdown may explicitly use `text-prefix-v1`. That existing fallback returns
indented source text when strict Markdown output exceeds the cap, and always
reports whether it truncated. It does not preserve Markdown structure or link
destinations. `truncated: false` means the selected fallback text fits—not full
browser conformance or factual verification. Leave the policy out for strict
Markdown failure. Neither successful recovery nor nonempty output proves that
every part of the original website was loaded or rendered.

The host API is `recoverResearchLoaderLimit(rawReceipt, trustedPins, selection,
signal?, format?)` in `scripts/research-json-replay.ts`. Decoded replay buffers
are cleared and owned documents closed on success, failure or cancellation;
caller receipt bytes remain unchanged. CLI stream ownership and bounded output
follow the existing replay lifecycle.

## Verified scope

September 18, 2026: 1,499 isolated tests pass across 17 files, including 190 new
admission/integration cases; build, type checking, format and lint pass. A real
605,306-byte captured HN response replays through the CLI without a request,
returning 136,318 bytes of source text with `truncated: false`. The original
loader failure remains recorded. See `reports/loader-limit-replay-2026-09-18.md`
and its JSON companion for original failures, exact artifacts and limitations.
