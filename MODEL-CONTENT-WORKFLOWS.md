# Native model documentation workflows

Use public source content without running models, copied examples, page scripts,
or installation commands. A model card or vendor claim is source material, not
an independently verified hardware ranking or compatibility guarantee.

## Capture once, inspect, then select

The native research CLI supports `--reader --capture-body`. Preserve the complete
receipt, body hash, requested/final URLs, classification and original outcome.
HTTP200 or `extracted-unverified` alone does not establish useful content.

Inspect source landmarks before selecting. The September16,2026 captures support
these selectors; they are not permanent site contracts:

| Source | Scope | Selected Markdown | Qualification |
| --- | --- | ---: | --- |
| Hugging Face Qwen/Qwen3-8B | `.model-card-content` |16,411 bytes|12 headings and14 literal code blocks retained; surrounding usage widgets excluded. |
| Ollama library/qwen3 | `#display` |1,719 bytes|4 headings and2 literal code blocks retained; this is the README, not the model-size catalog or API-example panel. |
| vLLM online-serving guide | `article` |17,451 bytes|28 headings and3 literal code blocks retained; whole-page extraction had exceeded its256,000-byte budget. |

No global budget was raised and no text-prefix fallback was used. Source images,
charts and dynamic widgets are not rendered. Strong emphasis is currently plain
text in Markdown; known source code-language classes are not appended to fences.
The words and literal code survive, but those formatting limits remain.

## Recover complete output-limit captures without another GET

The existing replay CLI accepts a complete default-profile capture whose original
failure is specifically the supported extraction-output limit. Supply trusted
receipt/body pins and an explicit selector. For the captured vLLM guide, the
actual CLI succeeds with both Markdown and structured JSON:

```sh
node "$PINNED_RUNTIME/dist/scripts/research-replay-cli.js" \
  --expected-profile default \
  --receipt-sha256 "$TRUSTED_RECEIPT_SHA256" \
  --body-sha256 "$TRUSTED_BODY_SHA256" \
  --body-bytes "$TRUSTED_BODY_BYTES" \
  --selector article --format markdown --recover-output-limit \
  < "$PINNED_RECEIPT"
```

These variables describe the caller's trusted capture ledger, not values to take
on faith from arbitrary page content. The CLI verifies the supplied pins and
failed-capture admission. It emits a JSON envelope containing the extraction,
zero-network provenance and original failure. Changing `--format` to `json`
selects structured content instead. Normal successful captures use the same
selector replay without `--recover-output-limit`.

Do not treat every `<main>` as a small article: vLLM's main wrapper contains
navigation, and the recorded `main` replay still fails. Opt-in `main-content-v3`
now supports conservative nested-article focus; see `NESTED-ARTICLE-FOCUS.md`.
It preserves admitted outside text. The original default-reader vLLM capture
still needs explicit selection; separate source-hidden interpretation can permit
automatic article focus without rewriting that historical receipt.

## Follow relocation evidence explicitly

The old vLLM `.html` URL returned302 to its trailing-slash URL. That second page
was an804-byte HTML relocation stub with an ordinary anchor to `online_serving/`.
Separate, source-directed native navigations reached the guide. No redirect
scripts or meta refresh ran, no URL was retried, and no access challenge was
bypassed. A redirect stub is not the requested document; preserve its verdict.

See `reports/model-workflows-2026-09-16.md` for exact URLs, evidence, separate
outcomes, source-fidelity checks and limits. These checks use the unchanged
committed runtime and do not clear SafeJS, authentication or rendering gates.
