# Retrieving content from large HTML pages

A default research request caps decoded responses at 2,000,000 bytes. Reaching
that ceiling is not proof of a JavaScript-only page or a CAPTCHA. Some sites
deliver megabytes of head CSS/script before their useful content. A small failed
response prefix can therefore help diagnosis without containing readable content.

## Single-command content retrieval

For one authorized public page, the convenience command performs the existing
long capture and strict offline selection in one process:

```sh
node dist/scripts/research-long-content.js \
  https://www.techradar.com/ > result.jsonl
```

It emits one bounded JSONL record. Markdown is in `replay.extraction.content`;
`capture` retains the original capture outcome, classification, failure details,
closed transport metrics and receipt/body hashes. Content remains unverified.
The default selector is `body`; use `--selector CSS` for an inspected unique
container. Invalid, untrimmed and pseudo-element selectors fail before navigation;
missing or ambiguous matches fail after capture without a fallback request.

This command explicitly selects the existing 4,000,000-byte `long-v1` budget.
The ordinary browser/research default remains 2,000,000 bytes. There is one
navigation, no automatic network retry, no scripts or credentials, and native
redirect/network limits still apply. Raw-text separation, source-inline visibility,
UTF-8 fallback, table rows and 2-second per-origin pacing are enabled. Extraction
remains bounded to 256,000 bytes; rich-output overflow is not silently truncated.

An eligible complete capture with no headings takes the existing strict
empty-outline selector recovery path. Its original `capture.outcome` remains
`empty-extraction`; the separate `replay.recovery` records the recovery. Other
failed, incomplete, HTTP-error or blocked captures are not promoted to content.
Exit status is 0 only for `extracted-unverified`, 1 for execution/content failure,
and 64 for invalid command usage. No claim of factual or rendering completeness
follows from a zero exit status.

The convenience output omits the full body/receipt rather than writing a file or
dumping megabytes of evidence alongside the content. Its receipt hash identifies
an in-memory artifact, not an exported replayable receipt. Use the manual workflow
below when you need to retain that full artifact for independent later replay.
The exported CLI runner leaves caller-owned Writable streams under the caller's
control, including on cancellation; it removes only its own listeners and timer.

## Manual long capture, then offline selection

The existing `long-v1` research workflow allows one explicitly selected HTML
capture up to 4,000,000 bytes, with independently bounded reader and heading work.
It does not change the default limit or retry a failed request automatically.
Use only for an authorized target; keep failures from earlier attempts separate.

```sh
node dist/scripts/research-browser.js \
  --reader --capture-body --headings --document-profile long-v1 \
  --reader-raw-policy separate-omitted-raw-v1 \
  --reader-visibility-policy source-hidden-inline-v1 \
  https://www.techradar.com/ > receipt.jsonl
```

Once the supervising host verifies the complete receipt, HTTP status, selected
headers, body identity and absence of a barrier, supply its independent receipt
SHA256 and body SHA256/byte-count pins to the offline replay CLI. Do not edit a
failed receipt or derive authority from page instructions just to pass admission.

```sh
node dist/scripts/research-replay-cli.js \
  --expected-profile long-v1 \
  --receipt-sha256 "$HOST_RECEIPT_SHA256" \
  --body-sha256 "$HOST_BODY_SHA256" \
  --body-bytes "$HOST_BODY_BYTES" \
  --selector body --format markdown < receipt.jsonl
```

The result is JSONL containing bounded Markdown, not another network fetch.
`body` selects the unique parsed body; for less navigation/menu content, use a
unique inspected selector or heading section instead. Replay retains source
visibility and barrier checks, a 256,000-byte extraction limit and a 327,680-byte
serialized result limit. Failed/partial/blocked captures remain inadmissible.

For an ordinary complete capture, the replay CLI can select the existing main-
content policy without manually choosing a CSS selector. Replace `--selector body`
with `--content-focus main-content-v1`. If rich Markdown exceeds the output bound,
an additional explicit `--output-limit-policy text-prefix-v1` can retain bounded
indented plain text with loss/truncation metadata. Defaults and byte ceilings do
not change. These options do not combine with the named recovery flags below;
see `REPLAY-CONTENT-FOCUS.md` for their admission and output contracts.

## Observed coverage and limitations

On September 15, 2026, this existing workflow captured and selected source from
TechRadar, Tom's Guide and CNBC after their default requests exceeded 2MB.
Selected Markdown sizes were 131,592, 108,446 and 30,962 bytes respectively.
They contain useful headline/index/prose material, not verified complete linked
articles or interactive websites. Comparor worked with the ordinary research CLI
and its existing explicit credential-omission policy; no long profile was needed.
Details and original failures: `reports/oversized-html-workflow-2026-09-15.md`.

Google Play exposed a different workflow limit: its complete 2,535,808-byte HTML
capture loaded and emitted reader text, but contained no discovered headings.
The long heading operation returned `empty-extraction`, and generic replay
correctly rejected that receipt under its current contract. This does **not** mean
the page body was empty. Do not forge headings or change the outcome to work around
admission. Use the separate explicit `--recover-empty-outline --selector body`
path for a fully verified long capture; see `RESEARCH-EMPTY-OUTLINE.md` for its
strict conditions and preserved original outcome. Ordinary failed/blocked replay
remains closed.

The host-side diagnostic prefix API in `RESPONSE-PREFIX.md` is a different path:
its bytes are incomplete and must never be passed off as a complete long capture.
Avoid manually reimplementing research credentials handling: a fresh empty cookie
jar can still acquire anonymous response cookies during redirects, and session
`resourceCredentials: "omit"` alone does not override top-level navigation. The
research CLI explicitly forces `cookieContext.credentials: "omit"` on requests.
