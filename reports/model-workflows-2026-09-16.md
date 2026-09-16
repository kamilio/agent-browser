# Native model-content workflows — September 16, 2026

## Outcome

Three public content workflows now have fresh native-browser evidence: a Hugging
Face model card, an Ollama model README/catalog, and vLLM's online-serving guide.
This batch changes workflow documentation and evidence, not browser production
code. It resolves the observed guide-retrieval workflow through existing bounded
saved-response selection; it does not claim the default whole-page failure fixed.

Runtime: committed `d20b2f0b0162fdeb04b06850e5ba3c8466af7448`, with all pinned
source files also matching starting HEAD `37965da5bb636555ec1838eeff68addd37209754`.
The existing native gate is46,333 passes/0 failures across942 available files in
four isolated shards;22 manifest files remain missing. No native suite was rerun
for these documentation-only changes. Build/types/format/lint evidence is reused
only for the identical pinned runtime, not represented as a new validation run.

## Five real requests, separate original outcomes

All requests used the actual native research CLI with honest AgentBrowser/0.1,
anonymous GETs, no cookies, no automatic redirects/retries, no scripts, no SDK,
and no alternative client or challenge solver. Requests/TLS sockets/process
groups closed, with empty isolated HOME/TMP directories. Each URL was requested
once. Synthetic identical-command controls ran under kernel/JS network denial
before each corresponding live scope.

| URL | Original observed outcome | Reviewed content/workflow |
| --- | --- | --- |
| https://huggingface.co/Qwen/Qwen3-8B |HTTP200;308,773 decoded bytes; extracted-unverified|Actual card prose, qualifications, model specifications and examples; source claims unverified. |
| https://ollama.com/library/qwen3 |HTTP200;95,599 decoded bytes; extracted-unverified|Model catalog fields, CLI/API examples and README; duplicated responsive navigation remains. |
| https://docs.vllm.ai/en/stable/serving/openai_compatible_server.html |HTTP302 observed; probe reports redirect-mode-error|Probe deliberately forbids redirects. Location points to the next row; not a server access restriction. |
| https://docs.vllm.ai/en/stable/serving/openai_compatible_server/ |HTTP200;804 decoded bytes; extracted-unverified|Relocation stub, not the guide. Ordinary source anchor points to the next row. |
| https://docs.vllm.ai/en/stable/serving/online_serving/ |HTTP200;636,652 decoded bytes; extraction failure|Complete body preserved; output256,015 bytes exceeds256,000 limit. Recovered offline below; original failure unchanged. |

The302's status and Location are retained in the native observer even though the
policy-denied CLI receipt has no primary response. Follow-ups were distinct,
source-directed page navigations, not retries of a challenged/denied URL.

## Request-free recovery and fidelity

Five actual replay CLI checks use pinned receipts under kernel/JS network denial.
Four return useful scoped output; the larger vLLM `main` control exits1 without
output. Its generic CLI failure is not assigned a more specific new diagnostic.
The original complete-capture failure above carries the precise output limit.

| Selection | Markdown bytes | Source headings matched | Exact source pre blocks matched |
| --- | ---: | ---: | ---: |
| Hugging Face `.model-card-content` |16,411|12|14|
| Ollama `#display` |1,719|4|2|
| vLLM `article`, output-limit recovery |17,451|28|3|

Independent Python HTML source parsing matches all44 heading labels/order and19
literal pre blocks in the selected scopes. Heading comparison accounts for
Markdown links, inline code, escaping/entities and paragraph-anchor glyphs.
Literal code is exact, except the newline required before a closing fence when
the original pre text lacks one. This does not execute or validate the examples.
The vLLM structured replay also succeeds:74,963 bytes for the complete CLI JSONL
envelope. Both vLLM outputs preserve original-failure and zero-request provenance.

A separate read-only review confirms substantive Hugging Face card content and
identifies two existing low-severity limits: discarded strong/emphasis delimiters
and code-language labels absent from Markdown fences. Source code-context metadata
still retains observed language classes. No speculative formatting change is made.
Ollama selected README intentionally excludes the catalog and API panel. Images
and charts remain alt/source text, not independently read graphical values.

The original synthetic control's hyphen matcher and three independent-audit
normalization errors are documented in AUDIT-CORRECTIONS.md; failed control
evidence remains. No failed native result was rewritten as a pass.

## Limits and next work

Selected output size is not complete CLI size or reduced network transfer.
Recorded process timings are individual observations, not a speedup benchmark.
All five real requests together serve three reviewed workflows, not five useful
pages. The historical100-page33 useful/67 other verdicts remain unchanged.

Default whole-page extraction still fails for the large vLLM guide; even its main
wrapper is too broad for the recorded replay. A conservative nested-article focus
that preserves substantive content outside articles is an actionable follow-up.
SafeJS scheduling, dynamic/full rendering, access/CAPTCHA handling, real password
providers/authenticators/devices and incomplete research remain separate gates.

Evidence root: `node_modules/.cache/native-validation/model-workflows-september16/`.
The ignored cache contains complete native receipts; the committed JSON report
records pins/measurements but is not a portable full-body archive. See
`MODEL-CONTENT-WORKFLOWS.md` for the maintained capture/replay recipe.
