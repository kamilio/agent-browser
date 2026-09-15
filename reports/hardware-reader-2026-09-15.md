# Hardware pages and inline XML recovery — September 15, 2026

## Result

Four new public native-reader navigations make **four GETs, all HTTP 200, with no
redirects or retries**. NVIDIA, AMD and Intel return nonempty Markdown. Framework
returns 211555 HTML body bytes but initially fails the reader under all three
visibility policies. A focused parser-admission change recovers useful Framework
product content from that exact saved response; the original failure is retained.

| Page | Original native result | Markdown bytes |
| --- | --- | ---: |
| `https://frame.work/desktop` | Unsupported loader input | 0 |
| `https://www.nvidia.com/en-us/products/workstations/dgx-spark/` | Extracted, unverified completeness | 37845 |
| `https://www.amd.com/en/products/processors/consumer/ryzen-ai.html` | Extracted, unverified completeness | 42340 |
| `https://www.intel.com/content/www/us/en/products/details/processors/core-ultra.html` | Extracted, unverified completeness | 39856 |

Native runtime source/configuration is compared against committed
`02e50f038b4aca9ba7a890ac38455631f830c557`: 1452 inputs match the pinned previous
clean build. Older archived documentation is not claimed to match current HEAD.
All four transports, children and groups close; all four body hashes verify.
No page scripts, SafeJS, credentials, supplied cookies, account interactions,
impersonation, CAPTCHA solver, listener or TTY is used. The existing response,
extraction, navigation and pacing limits remain unchanged. No barrier was observed
in these four responses; this is not a CAPTCHA-handling success claim.

## Root cause and fix

Framework embeds `<?xml version="1.0" encoding="iso-8859-1"?>` immediately before
a footer SVG. The declaration is **43 normalized UTF-16 units at offset 195463**.
The previous reader admitted this same strict grammar only at document offset
zero, so a harmless inline declaration rejected the entire document. Decoding
already selected UTF-8 correctly; no charset fallback is needed.

`src/research-loader.ts` now applies its existing maximum-256-unit syntax check
relative to each token start. It drops accepted declarations as inert HTML comment
tokens at any markup position. It does not interpret XML, change decoding, expand
entities, fetch resources, alter omission stacks or accept generic processing
instructions. Malformed/overlong declarations and CDATA still fail. Raw/RCDATA,
attribute and entity-decoded text is not retokenized. The bound applies to the
extra admission matcher, not the preceding tokenizer scan.

Reviewed production SHA-256:
`03c947f51593de7bf11f9875147df270b9faf411dd8504db6d942e62ad3fec6a`.
Static review finds no production blocker and identifies accounting/documentation
caveats covered in the final tests/docs. The review scope's 40-unit description
was a typo; its review preserves the measured 43-unit correction.

## Saved-response verification

The baseline and final candidate each navigate **26 policy cases from 22 saved
responses**, substituting verified bodies into native navigation with network
denied. This is not a live retry or reclassification of an original capture.

| Framework policy | Baseline | Candidate Markdown bytes | Candidate SHA-256 |
| --- | --- | ---: | --- |
| `source-hidden-inline-v1` | Loader failure | 18778 | `d118045ea2f0a9833a13eec6285d532aba6de1db6f3bc0843212d23bc7f1a2a0` |
| `source-hidden-v1` | Loader failure | 18778 | `d118045ea2f0a9833a13eec6285d532aba6de1db6f3bc0843212d23bc7f1a2a0` |
| Default visibility | Loader failure | 19694 | `05eb90262b3a91f304890b2ae35115e37d715d9afe6428607e534790f9bb0341` |

Manual inspection confirms product sections, CPU/iGPU/memory labels, Max 385 and
Max+ 395 configurations, LPDDR5x-8000 text and setup steps—not just a title or login
shell. These are manufacturer source claims, not independently measured local-LLM
performance, verified stock/prices, or purchase recommendations.

**All other 23 policy cases retain their previous outcomes and exact Markdown
hashes**, including Aozora's earlier leading-declaration recovery and the existing
RFC extraction-limit failure. Source metadata also matches. The two proof children
perform 52 in-memory navigations, 30 successful original-capture replays and 14
denied original-failure replay-admission checks. Both groups close with zero HTTP.
Two additional offline diagnostic groups also close with zero HTTP.

## Tests and retained failures

- Clean baseline: **1790 passing tests in 22 explicit native files**.
- Final candidate: **1849 passing tests in 23 files**, including **59 new tests**.
- Build, narrowed TypeScript, format, lint and native tests all pass for release02.
- **1783 baseline cases match unchanged**. Seven existing negative vectors/names
  intentionally change from now-valid inline XML to malformed version 2.0; no
  baseline case is dropped. Duplicate test names are compared by occurrence.
- Tests cover prefixes and nonzero positions, repeated declarations, 255/256/257
  local lengths, CRLF, supplementary characters, hidden/omitted subtrees, stack
  containment, UTF-8 extraction, raw/escaped text and exact resource boundaries.
- Inline split-text accounting explicitly retains two additional total tokens;
  hidden omission adds two omitted tokens versus one outside hidden content.

The first candidate's two type errors and two new-test assertion failures are
preserved. A Markdown format guard resolves the type errors. An owned diagnostic
shows the existing raw scanner charges an extra 63 lookahead work units for that
specific longer fixture; Markdown also correctly escapes its period. The tests
now assert those actual contracts, with a separate plain-text check. Production
bytes are unchanged between candidate releases. An initial two-location test
formatting correction is also recorded, not reported as an original passing check.

## Remaining content gaps

- **AMD specification values are present but not extracted.** The saved response
  has an entity-encoded `data-json` attribute on its product-specifications table.
  Markdown retains headings without product rows. Investigate bounded, separately
  labeled structured-source data extraction rather than assuming another request
  or JavaScript execution is necessary. Do not present it as verified visible text.
- NVIDIA specifications and Intel SKU rows survive, but footnote references and
  explicit table associations need better representation. Manufacturer theoretical
  FP4 performance and benchmark percentages are not measured LLM throughput.
- Intel teaser number/unit grouping and repeated entity-looking footer labels,
  along with shared navigation boilerplate, need source-aware review. Do not
  indiscriminately decode text twice or claim verified CSS visibility.

The broader browser objective remains active. This change does not resolve the
failed SafeJS scheduling contract, live-script support, provider/passkey,
interactive/service/TTY, broad research or general crawler-friction gates.

## Evidence and preservation

Private lane: `node_modules/.cache/native-validation/hardware-reader-september15/`.
It retains live receipts, source/compiled pins, all candidate results, diagnostic
failures/corrections, content/static reviews and per-case offline comparisons.
Public structured companion: `reports/hardware-reader-2026-09-15.json`.
Historical reports and original failure captures remain unchanged. The original
42 dirty tracked-file residuals and 697 original untracked-file records are
preserved. No push or broad performance claim.
