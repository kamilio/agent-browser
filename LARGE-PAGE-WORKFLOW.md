# Retrieving content from large HTML pages

A default research request caps decoded responses at 2,000,000 bytes. Reaching
that ceiling is not proof of a JavaScript-only page or a CAPTCHA. Some sites
deliver megabytes of head CSS/script before their useful content. A small failed
response prefix can therefore help diagnosis without containing readable content.

## Explicit long capture, then offline selection

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
