# Native LLM reference content — September 15, 2026

## Public observations

Four once-only native navigations, four GETs, zero redirects/retries, four
verified captured bodies and closed child groups/transports. Runtime source,
scripts, package and config match commit d1baa091e73ebca73b0a022aae9cb85b1fb65b13; the reused
validated archive contains older documentation, not a complete current-HEAD copy.
No credentials, supplied cookies, scripts, SDK imports, media, CAPTCHA solving
or account interaction. A source response is not interactive website acceptance.

| Source | HTTP | Live native outcome | Markdown bytes |
| --- | ---: | --- | ---: |
| huggingface.co | 200 | extracted-unverified | 9863 |
| mlcommons.org | 200 | extracted-unverified | 16986 |
| github.com | 200 | failure | 0 |
| machinelearning.apple.com | 200 | extracted-unverified | 5498 |

Exact targets:

- `https://huggingface.co/docs/transformers/en/quantization/overview`
- `https://mlcommons.org/benchmarks/inference-datacenter/`
- `https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md`
- `https://machinelearning.apple.com/research/efficient-large-language`

Hugging Face actually negotiated text/markdown, retained as literal source with
outline metadata. MLCommons exposes useful methodology but not the interactive
numerical results table. Apple's article is readable with navigation and related
cards; its displayed August 2024 date is not a current performance comparison.
GitHub's HTTP 200 response failed at the reader loader, not transport or challenge
handling. The original failure and all body/receipt hashes remain unchanged.

## Diagnosis and fix

The 643745-byte GitHub body has a hidden fallback containing nested paragraph
starts followed by redundant closing paragraphs. The first start is implicitly
closed; a later orphan end p previously triggered Malformed source-hidden reader
subtree. Direct native sanitizer diagnosis succeeds with the default policy and
fails with both hidden policies on this exact source.

The candidate ignores only end p while already inside a source-hidden omission,
and only with no p/svg/math ancestor in either visible or skipped stack. It emits
nothing and changes no stack; the actual hidden root still controls when visible
processing resumes. Other mismatches, foreign boundaries, unclosed roots and all
budgets remain strict. No default-policy switch, cache, dependency or limit change.
See SOURCE-HIDDEN-PARAGRAPHS.md.

## Validation and recovery

- Clean baseline: 1330 passing tests in 17 explicitly selected files.
- Candidate: 1426 passing in 18 files, 96 new; every baseline outcome matches.
- Build, targeted types, format and lint pass; read-only review has no finding.
- Fourteen saved responses yield 16 policy cases per build. Fourteen cases retain
  identical compared Markdown hashes, outcomes, failures, reader reports and
  source-alternate metadata. These checks do not claim every extraction field.
- GitHub source-hidden-v1 recovers 51435 bytes; source-hidden-inline-v1 recovers
  51421, with 163 and 166 source-hidden subtrees respectively. Build headings,
  CMake commands and backend sections are present; navigation clutter remains.
- GitHub's unchanged default-policy output is 52904 bytes; it is not substituted
  for the chosen hidden policy. The original failure is still a failure.
- Original failed GitHub receipts remain denied by ordinary replay in six checks.
  Recovery here uses controlled saved-response substitution for development,
  not a newly admitted successful receipt or a second live GitHub request.
- 32 native in-memory navigations, 18 successful original-receipt replays and one
  three-policy sanitizer diagnostic use zero HTTP requests. All three offline
  child groups close with empty HOME/TMP, unchanged pins and no denied-I/O attempts.

Source controls: Office, NASA, web.dev, PyTorch, GOV.UK, Julia, NumPy, RFC 9110,
Apple HTML/Markdown, plus the four new references. RFC's original whole-document
output-limit failure and Apple's HTML JavaScript notice remain unchanged.

## Research and remaining work

Research observations, source dates and receipt/body attribution are in
reports/llm-reference-research-2026-09-15.md. These notes describe quantization
tradeoffs, benchmark comparability and paper-specific memory techniques, not
reproduced hardware measurements, prices, a purchase recommendation or latest
model/benchmark results. Their GitHub exclusion describes the original live
capture; the separate offline repair above does not rewrite that observation.
Astra/Twitter and Poe/Reddit remain unresolved.

No full native release, live-candidate, interactive runtime, SafeJS, credentials,
passkey/device, service/socket or real TTY acceptance is claimed. No speed,
network-latency or block-rate improvement was measured. Continue diverse real
content tests and preserve human handoff at access restrictions.

Evidence: reports/llm-reference-content-2026-09-15.json and private lane
node_modules/.cache/native-validation/llm-reference-content-september15/.
Previous website reports, including the top-100 matrix, retain their original
outcomes and measurements. Prior work is preserved; no push.
