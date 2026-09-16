# Recovering adjacent source-list groups — September 16, 2026

## Outcome

Fix the evidenced PCMag extraction defect at the Markdown serializer: consecutive source lists now receive a neutral **Native list boundary (source groups only)** block. The captured review's two three-item lists remain distinct instead of merging into six bullets. Preserve all original text; do not infer pros/cons polarity from SVG icons or arbitrary styling.

Production changes are confined to `src/extraction.ts`. Emit boundaries lazily only when the next list produces output in the same quote/list-item context; clear adjacency on intervening emitted content. Preserve nested prefixes, list starts, empty items and link handling. JSON nodes and document state remain unchanged, and marker bytes count toward existing output limits. See `EXTRACTION-LIST-BOUNDARIES.md` for the contract and exclusions.

## Native regression and quality

- Final selected gate: **955 passed, 0 failed in15 files**, including51 new tests and904 existing cases. Build, strict types, formatting and lint pass, with clean process closure and empty HOME/TMP.
- The same final51 new cases against prior production give11 passes and40 failures. All51 pass after the fix. This demonstrates the regression rather than merely accepting pre-existing behavior.
- Initial core checks passed904 existing cases. The first full candidate produced952 passes/2 failures because new tests misclassified an empty heading as non-emitting and chose a byte limit below the API minimum. Correct those test assumptions; do not change unrelated heading/limit behavior. Initial red01 was11/39 across50 cases. Final red02 and release02 use the identical51-case fixture; all initial receipts remain unchanged.
- Pinned base commit `78d911edbd5e187e5fb6e726cc2a3765f48dc69e`; final source manifest has1525 entries including the canonical944-entry native manifest. Of2300 compiled artifacts, only extraction JavaScript and its two map files change. The other2297 artifacts, including exported declarations, remain identical to the pinned baseline. Working manifest has947 entries because three prior uncommitted additions stay separate.

## Saved-website differential

Replay **99 complete saved bodies** under kernel-denied networking:96 responses from the original100-entry corpus, plus wikiHow, PCMag and OutdoorGearLab article targets. Run the prior and candidate native loaders/extractors in alternating order, with identical options. No HTTP requests, redirects, retries, page scripts, alternate browsers, credentials or challenge-solving occur.

There are96 successful extraction pairs and three matching non-HTML admission failures (BBB, ZipRecruiter and Kate Minimalist under the selected long-HTML profile). Across the successful pairs, exact content and full normalized metadata match except for **24 added boundary blocks on11 pages**. Normalization touches only generated node references. All returned documents close, all input-body hashes remain unchanged, and the replay child/group close successfully. This is a compatibility regression replay, not99 fresh live validations or a new usefulness classification.

The PCMag article gains exactly one47-byte boundary, growing from38130 to38177 UTF-8 bytes. An additional artifact audit verifies precisely three existing bullets on each side, with the six original items and section text otherwise identical. Its prior body, verdict, specifications and29 marked article paragraphs remain recoverable; dynamic comparison-chart values and an icon-only specification are still absent.

The11 changed pages are Wikipedia's main page, Forbes, Healthline, Home Depot, WebMD, Yahoo Finance, Medical News Today, BobVila, Who What Wear, Cambridge Dictionary and the PCMag article. The companion JSON records all99 inputs, hashes, added-marker locations and matching failures. Original100-page live receipts and verdicts remain immutable in `reports/agent-citation-revalidation-v2.md`.

## Limits and next work

Do not infer a performance improvement from single alternating-order timing samples. This fix does not solve general inline-wrapper flattening, distinct blockquote identity, CSS-only labels, icon meaning or dynamic charts. No new network or SafeJS dependency is introduced. Prior62 broad native failures and22 missing committed manifest inputs, actual SDK, rendering, credential/passkey/device and access-handoff gates remain open.

Evidence is sealed at `node_modules/.cache/native-validation/list-boundaries-september16`: 88 files,8559623 bytes, ARTIFACTS SHA-256 `4bc0b144b6efdb61f97a094ad0aea4846700d5c5f6cf1a9cf0c8fcb194d6f35e`. The pre-existing42 tracked and697 untracked items are preserved apart from isolated additions to TASKS/native manifest. No push. Continue website compatibility work from captured content gaps, without treating access barriers or empty output as successful content retrieval.
