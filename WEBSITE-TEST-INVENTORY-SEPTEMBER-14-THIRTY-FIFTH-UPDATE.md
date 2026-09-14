# Website inventory: September 14, 2026, thirty-fifth update

Content acquisition, not rendering perfection, remains the priority. This is a
new read-only native-reader batch, not a rewrite of prior website observations.
The batch runs September 14, 2026, 23:09:45.295931–23:09:45.610528 UTC.

| Seed URL | Actual result | Content assessment |
| --- | --- | --- |
| `https://rocm.docs.amd.com/en/latest/` | HTTP 200; final URL unchanged; 8,502 encoded / 49,276 decoded bytes; 16,358 Markdown bytes | Useful static documentation verified in captured HTML and Markdown: GPU platform, SDK, AI ecosystem and deployment text. |
| `https://docs.vllm.ai/en/latest/` | HTTP 429; final URL unchanged; 5,923 encoded/decoded bytes | Cloudflare challenge, not documentation. No retry or workaround. |
| `https://www.swebench.com/` | Not attempted: the batch stops after vLLM | No request, status or content evidence; remains a candidate. |

There are **two HTTP requests, not three tested websites**: zero redirects,
zero mocked requests/bytes, 14,425 encoded and 55,199 decoded response bytes.
The process exits 2 for mixed outcomes, without timeout; child/group are absent
and both transports report closed with zero active requests. Private HOME/TMP
remain empty. No credentials, page scripts, SafeJS, external browser, service
listener or real TTY/PTY are used. The scope uses 250 ms per-origin pacing; visits
to two distinct origins do not demonstrate global or same-origin delay.

## Semantic and integrity checks

The ROCm page contains installation, compatibility-matrix and vLLM-inference
documentation links, verified in the output but **not followed**. This supports
useful content acquisition, not a hardware recommendation or verified claims
about every linked product. Native `extracted-unverified`/null `contentSuccess`
fields remain unchanged; an independent review records substantive content.
The reader deliberately marks its partial, scriptless/styleless representation.

The vLLM response has HTTP 429, challenge-platform and `_cf_chl_opt` markers and
a JavaScript/cookie requirement. Its `semantic-barrier` and false `contentSuccess`
are retained. Batch code stops at barriers/rate limits, so SWE-bench has no record.

Decoded response SHA-256:

- ROCm: `d50cf765fb6a031272bc262ec387ea9d4f60942373cc8b2046a21823a5b62119`.
- vLLM: `f52cbe00027d9d0371a10a2cdc7ceee8f2cebcadfc643fe9a2f970b5e9ea8666`.

The native research executable is the previous resource-reuse candidate anchored
to commit `e3b5190592c8cf69054ce4d62d6c158e6d44ff69`, with its 2,204 compiled-file
ledger. It is not the new CLI-cache candidate. Parent evidence checks the prior
source ledger against that commit and preserves original receipts and hashes.
Encoded-byte totals remain transport observations, not independent packet capture.

Evidence: `/dev/shm/agent-browser-model-docs-september14/`, copied to
`node_modules/.cache/native-validation/model-docs-september14/`. See original
`EXECUTION.json`, `stdout.jsonl`, `CONTENT-VERIFICATION.json`, `REVIEW.md` and the
additive `PARENT-VERIFICATION.json`.

The separate CLI-cache increment passes 563 targeted native cases and four
socket-denied configuration smokes; those are not website validation. Broad
research on hardware, benchmarks, model chatter and Poe remains incomplete.
Restricted sites, JavaScript-only content, rendering/pointer gaps and separate
SafeJS/device/credential/full-release gates remain open. No push in this increment.
