# Native color-media research checkpoint — September 5, 2026

## Live result: unresolved contract

One separately authorized native-browser request followed the official link
already retained at CSSOM native root **e5548**:
`https://drafts.csswg.org/mediaqueries-5/#descdef-media-color`.
Only its fragment was removed for navigation. No alternate URL, redirect,
subresource or retry was requested. The request returned HTTP 200, but the
unchanged native reader failed at its depth budget before admitting a document.
There are **zero extracted scopes and zero normative extraction bytes**.
No new color-media semantics, source title/status/date, or conformance conclusion
is inferred from the downloaded raw body. HTTP success is not content access.

| Receipt field | Original measurement |
| --- | --- |
| Requested document | `https://drafts.csswg.org/mediaqueries-5/` |
| Received at | September 5, 2026, **06:57:25.980 UTC** |
| Original body archived before loading | **06:57:25.982 UTC** |
| Completed/closed | **06:57:26.022 UTC** |
| Status / actual requests / redirects | 200 / 1 / 0 |
| Decoded / encoded bytes | 709,021 / 114,627 |
| Decoded-body SHA-256 | `13710d9352b367231363ef2445541cbf17a443f7e7af2f0707949f95a523546c` |
| Failure | loader; `resource-limit: Reader budget exceeded` |
| Final active requests / closed | 0 / true |

The fixed native build was
`node_modules/.cache/native-validation/research-selector-integrated.70qOGd/dist`,
not the subsequently implemented Screen candidate. Source/transport ceilings
remained at most 2,000,000 bytes/code units, DOM nodes 50,000 and depth 128.
Planned extraction ceilings of 32 scopes, 32,000 bytes per scope and 64,000 bytes
total were unused. No script-enabled fallback, other engine, SDK, detector,
challenge action, credential, device or local listener was used.

## Evidence and independent checks

The original lane is preserved under
`node_modules/.cache/native-validation/color-media-research/`: `PROVENANCE.md`,
`attempt.json`, `capture.mjs`, `capture.json`, `capture.jsonl`, original timing/
stderr, `receipt-before-loader.json`, `response-body.bin`, `REPORT.md` and
`AUDIT.json`. Its ledgers cover **17 artifacts, 1,592 fixed-build entries and
two inherited CSSOM evidence files**. Worker and parent checks passed; parent
logs are `color-media-parent-{artifacts,build,inherited}.log` in the parent cache.
These are integrity checks, not project tests or successful source extraction.
The original lane made no offline replay and its failed output is unchanged.

## Separate offline depth diagnosis

At **07:00:25.750 UTC**, a parent-only offline diagnostic used the exact archived
body and native decoder/tokenizer/sanitizer. A separate copy of the fixed compiled
loader adds one observation immediately before its unchanged depth check;
imports still reference the pinned native modules. The original build and HTML
bytes are not modified, and no ceiling is raised or alternate parser used.

The same guard rejects **depth 129 against limit 128**, at source code-unit
offset **476,389**, starting `th`, after **20,787 tokens**, **194,249 text code
units** and **296,952 output code units**. Its source-open stack accumulates
`thead`/`tbody`, repeated `tr`, and adjacent `th`/`td` entries. This identifies
optional table-end accounting as the next investigation target; it does not
measure final native DOM depth, prove a fix safe, or recover normative content.

Files are under `node_modules/.cache/native-validation/reader-media-depth/`:
`instrumented-loader.mjs`, `diagnose.mjs`, `diagnostic.json` and
`diagnostic-02.log`. The initial `diagnostic.log` retains a harness assertion
failure caused by passing the decoder record instead of its text field. The
corrected diagnostic still fails the native reader guard as intended. There
were **zero additional requests and no successful extraction**.

## Next work and limits

Investigate bounded accounting for adjacent cells, rows and row groups without
weakening depth limits or discarding reconstructable formatting. Start with
native synthetic regressions and explicit table-scope/barrier cases; preserve
conservative handling where native parser behavior is not established. Only
then compare any candidate against these unchanged bytes offline. A later
successful replay must not rewrite this failed live receipt or claim fresh live
acceptance. New live/runtime/device gates need their own authorization.

The Screen capability's viewport-backed geometry and 24-bit unknown/private
fallback use previously acquired CSSOM evidence, independently of this failure.
CSS color/device features remain unsupported and full Screen/color-media
consistency remains unresolved. All denied RP, identity-runtime and wire probes
stay untouched; the overall browser goal is still active in `TASKS.md`.
