# Native website flows — September 11, 2026

These are new, bounded website operations, not a rerun of historical evidence.
Initial operations use the validated native build under
`node_modules/.cache/native-validation/native-rate-limit-september11-round02/snapshot01/dist/`.
Those identity checks cover 991 source files and 1,780 compiled files; the later
link-discovery/product follow-ups explicitly identify their newer build. No
Chromium, Firefox, remote browser, site-script runtime, credentials or existing
browser profile supplied the results. Source/build identity is not evidence of
full website compatibility.

## A real public search form

The native BrowserSession loaded `https://html.duckduckgo.com/html/`, discovered
its actual enabled `q` input and form owner, filled the public constant
`OpenAI Astra model`, and called native `requestSubmit`. The observed form uses
POST. Its prepared URL/body were checked before dispatch; only the bounded
public search submission was permitted, not arbitrary POSTs or account actions.

The operation ran **06:05:18.922Z–06:05:19.873Z UTC**. Both homepage and result
returned HTTP200: 3,108 and 28,827 decoded bytes respectively. Native counters
record two requests, zero redirects and a closed transport with zero active
requests. The result document title contains the submitted query, has 810 nodes,
and replaces/closes the old document. No form nodes were manufactured and no
search destination was guessed to substitute for form submission.

**The original live harness exited1.** Its final assertion compared lowercased
text with the mixed-case query. That assertion defect does not undo the recorded
native submission, but the invocation is not relabeled as a passing check.
The original report, code and exit status remain in
`node_modules/.cache/native-validation/native-ddg-search-flow-september11/`.
Its report SHA-256 is
`e361e7cdbe7518b744824e8fda3003f14ebbc31e53c504e78b81f6bd9d94de41`.

A separately scoped **offline** audit ran
**06:09:33.205Z–06:09:33.306Z UTC**, exit0. It verified the original body hashes,
loaded the saved result once with the same native parser, compared both sides
case-insensitively, checked the two retained search-input values and inspected
ten native result links. It recorded zero network/guard attempts and closed its
document. Evidence:
`node_modules/.cache/native-validation/native-ddg-search-flow-offline-september11/`.
The result body SHA-256 is
`29c103ded83666ad34951dd6d3dd3801ac70b89b6b7e3eb9a6f23b47b3b398ab`.

This proves a bounded native form-to-result sequence, not full styled search
support or a passing original harness. The probe's single-origin restriction
excluded the observed stylesheet on `duckduckgo.com`; reports preserve zero
external sheets and stylesheet-load diagnostics. No mouse-click rendering,
keyboard submission, page JavaScript, authentication or persistent cookie flow
was tested.

## Compatibility failures that need implementation work

- **Wikipedia portal:** `https://www.wikipedia.org/` returned HTTP200, 119,573
  decoded bytes, one request and no redirects. Native HTML loading then threw
  `HTML svg tree construction is not implemented`, before any form was available.
  Original exit1 at **06:02:50.349Z–06:02:50.493Z UTC**; no submission or retry.
  Evidence: `node_modules/.cache/native-validation/native-wikipedia-form-flow-september11/`.
  Body SHA-256: `6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.
- **Bing Poe search:** HTTP200 and 116,600 decoded bytes did not yield a loaded
  reader document. A separately scoped, zero-network native diagnostic locates
  the throw in HtmlTokenizer: `Malformed HTML attribute name is not implemented`.
  It occurred on tokenizer call963, starting at UTF-16 offset97,862. No Reddit
  opinions, snippets or follow targets were extracted. The failed receipt stays
  ineligible for admitted content replay. Evidence:
  `node_modules/.cache/native-validation/native-poe-search-flow-september11/`
  and its `loader-diagnostic/` subdirectory.
- **WHATWG parsing reference:** HTTP200 and 787,795 decoded bytes reached the
  reader's depth limit: observed129, maximum128. A separately scoped offline
  diagnostic reproduces the retained-element stack check on token3,058, a start
  `a` tag. Its bounded tail includes optional table row/cell starts, suggesting
  implied table-end accounting needs investigation; it does not prove the cause
  or recover the full stack. No normative foreign-content section was extracted.
  Evidence: `node_modules/.cache/native-validation/native-foreign-content-reference-september11/`
  and `depth-diagnostic/`.

These are native parsing/reader gaps, not requests for another blanket user
authorization. Supporting SVG requires real foreign-content semantics rather
than claiming HTML elements are SVG or treating an omitted graphic as rendered.
Malformed-attribute and implied-end handling need focused reproductions without
silently increasing existing document budgets.

## NVIDIA: a discovery API gap

The official product index returned HTTP200 and 317,080 decoded bytes with one
request and no redirects. The sole whole-body JSON replay exceeded the unchanged
256,000-byte extraction cap. A separately scoped zero-network predicate replay,
`a[href*="dgx"]`, then failed because existing selector replay requires one
selected element. That error establishes multiple matches under the pinned
implementation, not their exact count or targets. Neither attempt followed a
product URL or produced product specifications.

Evidence remains under
`node_modules/.cache/native-validation/native-nvidia-products-flow-september11/`
and `targeted-links/`. RESEARCH-LINK-DISCOVERY.md tracks the focused multi-link
API response to this gap, without weakening ordinary selector replay or raising
the full-document extraction cap.

After the new API's isolated validation, a separately scoped offline check at
**06:23:53.562Z–06:23:53.736Z UTC** returns16 matching links in3,979 JSONL bytes,
not truncated, with zero network requests. Native node `e854` supplies the actual
`https://www.nvidia.com/en-us/products/workstations/dgx-spark/` target, rather
than guessing another route. This check uses the new995-source/1,784-compiled-file
snapshot, not the earlier build used for the failed operations. Evidence:
`node_modules/.cache/native-validation/native-nvidia-link-discovery-september11/`.
No product destination or specification is validated by link discovery alone.

### Observed product-page follow-up

A subsequent native visit to that exact observed URL runs at
**06:26:07.737Z–06:26:08.205Z UTC**, exit0. It returns HTTP200, 607,792 decoded
bytes and 40 non-truncated headings with one request and no redirects. Native
transport closes with zero active requests. No guessed alternate route, identity
change or retry of the old data-center URL is involved.

One offline replay of the observed **NVIDIA DGX Spark Specifications** heading
(`e3353`) runs at **06:27:18.528Z–06:27:18.977Z UTC**, exit0, with zero network
requests. It emits 28,180 JSONL bytes. Evidence and detailed source-node references:
`node_modules/.cache/native-validation/native-nvidia-observed-product-september11/RESULT.md`.

NVIDIA's captured section lists **128 GB coherent unified LPDDR5x memory**
(`e3433`), **273 GB/s memory bandwidth** (`e3451`) and **4 TB storage** (`e3460`).
Its **up to 1 PFLOP FP4** headline (`e3424`) is explicitly qualified as theoretical
performance using sparsity (`e3607`). These are manufacturer claims, not measured
local-LLM throughput, tokens per second, capacity for a particular model or a
best-hardware recommendation. The section's **June 2025 noise declaration**
(`e3644`) is not evidence of a release or page-update date.

The product receipt SHA-256 is
`6c4b5fe04b10cbc5fef7d10bbaf2e2b9586d0c988f6608045c25ec518c1bf324`;
the body SHA-256 is
`60b1b1531d1df3c03e53612f5b79d1e388e87f3910f866a00e9f4aed92ae57e5`.
Both operations retain `extracted-unverified`, `partial: true` and
`contentSuccess: null`. Their 995-source/1,784-compiled-file identities and cleanup
checks pass; no visual, script, buying or model-execution workflow was tested.

## Research status and access restrictions

The DuckDuckGo result supplied an observed link to
`https://openai.com/index/gpt-6-astra/`. A subsequent single native request to that
exact public link returned **HTTP403 with a confirmed Cloudflare challenge**.
It stopped without retry or replay. Evidence:
`node_modules/.cache/native-validation/native-astra-primary-september11/`.
Search-result titles therefore remain search claims: this flow verifies neither
the model identity/announcement date nor Twitter chatter. No Reddit Poe opinions
were obtained, and no hardware ranking or benchmark result was established.

All original failures, output streams, response identities and separate audit
statuses remain at their original paths. Native transports closed and offline
guards recorded no network attempts. Per-operation supervision uses clean private
HOME/TMPDIR, non-TTY pipes, 30-second deadlines with five-second grace and six-MiB
output containment. No CAPTCHA solution, measured fingerprint improvement,
throughput benchmark, full-site pass or secrets/passkey acceptance is claimed.
