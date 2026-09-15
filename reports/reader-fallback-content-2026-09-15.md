# Content pages, source-linked follow-ups and compact replay — September 15, 2026

Eight initial public native page attempts plus two explicitly source-linked follow-ups:
**10 GETs, zero redirects/retries, 10 verified captures and closed native children**.
Pinned live build matches commit 243406a. Public source only; no page scripts,
credentials, alternate browser/client, challenge solver, fingerprint rotation or
account interaction. Nonempty text remains extracted-unverified, not application success.

## Every initial URL

| Requested URL | HTTP | Native outcome | Markdown bytes | GETs | Private evidence directory |
| --- | ---: | --- | ---: | ---: | --- |
| `https://github.com/ggml-org/llama.cpp` | 200 | extracted-unverified | 50135 | 1 | `001-github.com` |
| `https://arxiv.org/abs/2307.09288` | 200 | extracted-unverified | 16485 | 1 | `002-arxiv.org` |
| `https://www.phoronix.com/review` | 404 | http-failure | 5132 | 1 | `003-www.phoronix.com` |
| `https://lobste.rs/` | 200 | extracted-unverified | 20350 | 1 | `004-lobste.rs` |
| `https://www.reuters.com/technology/` | 401 | http-failure | 44 | 1 | `005-www.reuters.com` |
| `https://www.rfc-editor.org/rfc/rfc9309.html` | 200 | extracted-unverified | 38930 | 1 | `006-www.rfc-editor.org` |
| `https://www.anthropic.com/news` | 200 | extracted-unverified | 10786 | 1 | `007-www.anthropic.com` |
| `https://en.wiktionary.org/wiki/benchmark` | 200 | extracted-unverified | 30222 | 1 | `008-en.wiktionary.org` |

GitHub includes README/setup content plus navigation noise; arXiv provides the
abstract and explicit full-document links. RFC9309 includes protocol text/ABNF;
Lobsters and Anthropic provide story/news lists; Wiktionary supplies dictionary
entries and translations plus navigation. Phoronix /review is an actual404;
Reuters401 supplies only a JS/ad-blocker notice, not the requested news content.

## Explicit source-linked follow-ups

| Requested URL | HTTP | Native outcome | Markdown bytes | GETs | Private evidence directory |
| --- | ---: | --- | ---: | ---: | --- |
| `https://www.phoronix.com/reviews` | 200 | extracted-unverified | 28567 | 1 | `followups/001-www.phoronix.com` |
| `https://arxiv.org/html/2307.09288v2` | 200 | failure | 0 | 1 | `followups/002-arxiv.org` |

Phoronix's original404 links /reviews, which separately returns its index. Its
original outcome remains unchanged. The arXiv abstract links the full HTML;
that source loads but exceeds the 256,000-byte extraction budget. No limit is
raised and no request is retried. Existing offline recovery discovers 130
headings; whole-body default and compact output still fail at the output cap.

## Concrete replay improvement

Expose existing compactTables through selector/section replay and explicit
output-limit recovery, including the CLI --compact-tables flag. Preserve defaults,
source pins, original-failure provenance, classification and ownership. Actual
CLI output matches existing native compact extraction for the arXiv Pretraining
section (28,448 bytes, or 24,758 with rows) and RFC9309 (39,197 bytes). Uncompacted
Pretraining is 36,118 bytes. This is selected source content, not full-paper or
benchmark-validation success. See RESEARCH-COMPACT-REPLAY.md.

## Validation and remaining work

1311 selected native assertions pass; one unchanged baseline
assertion fails in research-table-rows-cli.test.ts, which still expects already
supported selector recovery to be rejected. All 158 new assertions
pass and all 1,154 baseline statuses match. Build/types/format/lint pass; this is
not an all-green full native release. Two production files have an independent
no-actionable-findings static review. Fourteen guarded offline children include
the preserved failed diagnostic helpers and expected usage/output-limit rejection
controls; all close with zero network attempts. Initial scope/count/prototype,
direct-extraction-default and CLI-exit assumptions are retained in local caveats.

Saved-source inspection verifies 22 earlier top-100 receipts: 13 empty results
and nine tiny extracts. No lost article/data text or justified reader fix is
demonstrated; initialization/skeletons and application-runtime gaps remain. Do
not invent static alternatives or call a shell functional. The old top-100 matrix
and measurements are unchanged. Full runtime, interactions, credential/passkey,
service/socket and TTY acceptance and the broader research conclusions remain open.

Private evidence: node_modules/.cache/native-validation/reader-fallback-content-september15/.
Machine-readable measurements: reports/reader-fallback-content-2026-09-15.json.
No push or broad browser completion is claimed.
