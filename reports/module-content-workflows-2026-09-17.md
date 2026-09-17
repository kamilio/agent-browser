# Four deep documentation workflows — September 17, 2026

## Native website results

Four manually selected task pages return substantive source content through the
repository native browser. These are not a popularity ranking, a new100-site
sweep, or evidence that source examples execute correctly. Each URL receives
one anonymous GET, with no redirects, retries, credentials, page scripts, SDK,
alternate client/browser, identity changes or challenge solving.

| Page | HTTP | Decoded bytes | Markdown bytes | Native operation ms | Source pre blocks checked |
| --- | ---: | ---: | ---: | ---: | ---: |
| MDN JavaScript module guide |200|270145|60223|223|68|
| web.dev module-workers article |200|103565|10776|378|11|
| Python importlib reference |200|209291|80702|332|10|
| Rust async-concurrency chapter |200|52658|24185|100|12|

Exact tested URLs:
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
- https://web.dev/articles/module-workers
- https://docs.python.org/3/library/importlib.html
- https://doc.rust-lang.org/book/ch17-02-concurrency-with-async.html

Requests are received between00:25:27 and00:25:36 UTC. Native operation timings
exclude some process startup/supervision; supervised jobs take0.328–0.583 seconds.
These are single observations, not an A/B speedup, representative latency test,
rendering measurement or proof that pacing caused the absence of challenges.

All use default document/transfer/output limits, main-content-v3, explicit
source-hidden-inline visibility, separate raw accounting, UTF-8 fallback,
compact tables and table rows. Each selects main. CSS and JavaScript remain off;
source attributes and inline display are not full rendered visibility. All four
transport/request/TLS/socket/process groups close, with empty HOME/TMP.

## Source fidelity and useful tasks

An independent saved-HTML audit compares all **101 source pre payloads** with
their corresponding Markdown code blocks in order. All match. Eight Rust blocks
gain only the terminal LF needed before a closing fence; internal text, blank
lines and indentation remain exact. MDN list-contained examples account for
container indentation, not changes to code. No examples or SDK code are executed.

Independent MDN/web.dev prose review samples beginning/middle/end and important
qualifications, supplemented by a normalized source-block presence scan. It finds
substantive guide content, not navigation-only output, while retaining the
web.dev article's historical context. This is not complete rendered-page or
factual/API verification. Parent checks additionally retain three complete
normalized qualification paragraphs in the selected Python/Rust workflows.

Five compiled replay CLI attempts use the pinned captures under kernel/JS network
denial. Four successful, explicit heading selections answer narrower questions:

| Source | Section selector | Markdown bytes | Source code blocks retained |
| --- | --- | ---: | ---: |
| MDN |`#cyclic_imports`|3355|4|
| web.dev |`#preload_workers_with_modulepreload`|1567|1|
| Python |`#importing-a-source-file-directly > h3`|1246|1|
| Rust |`#code-within-one-async-block-executes-linearly`|2463|1|

All seven selected code payloads match an ordered subsequence of the already
audited source blocks. Python retains the recipe's caution and alternatives;
Rust retains the explanation of sequential execution and why awaiting individual
futures in sequence is not the demonstrated concurrent pattern. These are
source-preservation checks, not endorsements or execution tests.

The original Python `--section '#importing-a-source-file-directly'` exits1 with
no output and a generic diagnostic. Its source ID belongs to a section container,
whereas the API requires an h1–h6 target. The explicit child-h3 selector works on
the same receipt with zero requests. The original failure is preserved, not
reclassified as success or silently retried. Smaller selected outputs are not
lossless whole-page replacements or reduced network transfer.

## Findings and corrected diagnostics

- **Remaining low-severity limitation:** web.dev's three author-profile links
  lose their SVG-only descendant labels. Anchor accessibility labels survive
  reader admission but do not become fallback Markdown link text. Portrait alt
  and byline also flatten into a repeated name. This affects attribution context,
  not the article body. A future fix must distinguish source-declared accessible
  names from visible publisher prose and preserve existing hidden/source rules.
- An initial MDN link-defect finding is withdrawn: one entity decode of the
  Markdown destination matches one HTML attribute decode byte-for-byte. Raw
  encoded-versus-decoded string comparison was not evidence of URL corruption.
- MDN's native-list-boundary text is the documented generator annotation that
  preserves separate source lists, not newly invented publisher prose.
- Initial synthetic proof expected unescaped prose hyphens; the corrected proof
  checks the entire exact Markdown. Initial code audit missed two indented MDN
  fences; the corrected audit compares their actual payloads. Original controls,
  diagnostics and scripts remain, with separate correction notes. No browser
  production code is changed to address these diagnostic mistakes.

## Runtime and remaining gates

Runtime source/compiled bytes match committed31f3fe9b4bc75e853e937f86d1f2f4f97e4b1f69:
1559 pinned source/config/test files and2332 compiled entries. Its prior1025/0
native gate across41 selected files and build/types/format/lint checks are reused
for the identical runtime, **not rerun or counted as new tests**. The canonical
970-entry manifest still includes22 missing files; no new full-native pass.

This batch changes evidence and workflow documentation, not production. No
SafeJS0.1.640 execution, HTML-module loading, callback-tail acceptance, real
credentials/passkeys/devices, rendering or interactive-site coverage is newly
established. No barrier is encountered on these four requests, but broader access/
CAPTCHA handling and the original research topics remain open. The historical
100-entry33-useful/67-other assessment is unchanged. The overall goal stays active.

Evidence: `node_modules/.cache/native-validation/module-content-workflows/`.
Exact URLs, timestamps, hashes, boundaries, outcomes and replay details are also
in `reports/module-content-workflows-2026-09-17.json`. Raw server headers and
complete page captures remain private local evidence rather than report content.
