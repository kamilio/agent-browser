# Native content-page sweep — September 15, 2026

## Scope and results

Runtime: `eb9b63ea6cea9ba5cace3da12358595062f13b81`. Two disjoint six-page batches, one
navigation per initial URL, explicit Markdown preference with HTML fallback.
All browsing uses the repository's native CLI. The original twelve attempts
produced eleven extracted-unverified outcomes and one output-limit failure;
one nonempty outcome was only a textual redirect notice. Ten initial outputs
contain substantial-looking source content, still unverified.

A separately scoped explicit follow-up to the PyTorch notice's public link
retrieved its documentation. Total: **13 navigation attempts, 14 GETs including
one HTTP redirect, zero retries, 13 verified captures**. All children, requests
and sockets close. No credentials, scripts, challenge solving or alternate
browser. No production changes or new full-native-release claim.

## Every attempted URL

Entry13 is the separate follow-up; it does not rewrite the original corpus.
Bytes below are body extraction bytes, not completeness or quality scores.

| Entry | Requested URL | HTTP | Served MIME | Original outcome | Extracted bytes | GETs | Content triage |
| ---: | --- | ---: | --- | --- | ---: | ---: | --- |
| 1 | `https://en.wikipedia.org/wiki/Large_language_model` | 200 | text/html | failure | 0 | 1 | Whole extraction exceeds output cap; three sections recovered offline. |
| 2 | `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise` | 200 | text/html | extracted-unverified | 56313 | 1 | Substantial source prose/code; compatibility and example-output gaps remain. |
| 3 | `https://docs.python.org/3/library/asyncio-task.html` | 200 | text/html | extracted-unverified | 72719 | 1 | Substantial source prose and examples; unverified. |
| 4 | `https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html` | 200 | text/html | extracted-unverified | 29755 | 1 | Substantial chapter prose and examples; unverified. |
| 5 | `https://go.dev/doc/effective_go` | 200 | text/html | extracted-unverified | 109796 | 1 | Substantial source prose and examples; unverified. |
| 6 | `https://docs.docker.com/get-started/docker-overview/` | 200 | text/markdown | extracted-unverified | 9296 | 1 | Literal Markdown source, fenced; title metadata empty. |
| 7 | `https://kubernetes.io/docs/concepts/overview/` | 200 | text/html | extracted-unverified | 115675 | 1 | Substantial source text with navigation noise; unverified. |
| 8 | `https://git-scm.com/docs/git-rebase` | 200 | text/html | extracted-unverified | 75088 | 1 | Substantial command documentation; unverified. |
| 9 | `https://arxiv.org/abs/2307.09288` | 200 | text/html | extracted-unverified | 16485 | 1 | Abstract/metadata page, not full paper. |
| 10 | `https://huggingface.co/docs/transformers/en/quantization/bitsandbytes` | 200 | text/markdown | extracted-unverified | 14753 | 1 | Literal Markdown source, fenced; title metadata empty. |
| 11 | `https://docs.ollama.com/gpu` | 200 | text/markdown | extracted-unverified | 12580 | 1 | Literal Markdown source, fenced; title metadata empty. |
| 12 | `https://pytorch.org/docs/stable/notes/cuda.html` | 200 | text/markdown | extracted-unverified | 117 | 2 | Textual redirect notice only; explicit follow-up is entry13. |
| 13 | `https://docs.pytorch.org/docs/2.14/notes/cuda.html` | 200 | text/markdown | extracted-unverified | 163872 | 1 | Explicit source-linked follow-up; substantial literal Markdown source. |

## Offline recovery

Wikipedia returned 1,071,877 HTML bytes but failed at the unchanged 256,000-byte
extraction cap (observed 256,013). Its original receipt stays a failure. Existing
pinned output-limit recovery discovers 64 headings without truncation and
recovers Training/Inference/Evaluation sections of 2,919/6,828/8,239 bytes. Four
actual replay CLI checks agree with independent API data; ordinary replay of
the failed receipt remains denied. No refetch or cap increase.

Six guarded offline children include a preserved initial API assertion failure
from comparing null-prototype diagnostic objects with parsed ordinary objects;
a corrected data comparison passes. All close with zero network attempts.

The source-linked PyTorch follow-up produces 163,872 extraction bytes from
163,862 source bytes. Removing its outer fence reproduces the source exactly.
Its 2.14 path is observed link provenance, not a newest-release claim.

## Limitations and next steps

These are public source-content checks, not application/rendering acceptance.
MDN retains dynamic-section gaps. HTML pages retain some interface/navigation
noise; the arXiv URL is only an abstract page. Served Markdown remains literal
fenced source with empty title metadata. Hardware and benchmark research
conclusions, authenticated/social-site coverage, broader runtime/device gates
and CAPTCHA handling remain open.

See `CONTENT-PAGE-WORKFLOWS.md` for tested negotiation and recovery commands,
and `reports/content-pages-2026-09-15.json` for hashes and measurements. Private
original receipts/observer logs stay at `node_modules/.cache/native-validation/content-pages-september15`; do not publish raw redirect
query values. Earlier top-100 results and paths remain unchanged.
