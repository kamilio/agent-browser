# CSS import fetching: bounded primary-source research

## Outcome and scope

On **September 11, 2026**, the authorized released native browser retrieved
`https://www.w3.org/TR/css-cascade-5/` successfully. One native reader navigation
made **one actual bodyless GET**, with HTTP 200, no redirect, no retry, no page
subresources, and no mock requests. Three subsequent native heading-section
extractions used the intact captured document offline, with **zero additional
navigation or wire requests**.

The source establishes import placement, conditional application/fetching,
independent stylesheet occurrences, origin/encoding inheritance, MIME handling,
and cascade/layer ordering. **It does not establish exact import request mode,
credentials mode, inherited referrer policy, final-response URL resolution bases,
or cycle handling in the extracted sections.** Those questions remain open, not
filled in from HTML link `crossorigin` behavior or remembered algorithms.

This is source research, **not implemented-browser compliance evidence**. The
research request's `credentials: omit` is an authorization guard, not a finding
about CSS import credentials. The endpoint's Last-Modified header was January 11,
2022; retrieval on September 11, 2026 does not establish a newly revised spec.

## Verified requirements

All section IDs below belong to the retrieved CSS Cascading and Inheritance
Level 5 document. Their anchors are present in native extracted heading links.

| Topic | Exact requirement or distinction | Source section |
| --- | --- | --- |
| Import placement | Imports precede other valid at-rules and style rules, ignoring `@charset` and empty `@layer` definitions. Intervening other valid rules between imports invalidate the later import. | §2 `#at-import` |
| URL spelling | A string import target is interpreted as a URL of the same value. This does not itself specify the URL resolution base. | §2 `#at-import` |
| Cascade substitution | A valid imported stylesheet contributes as if inserted at its import rule. Explicitly sheet-local features remain local; within-sheet ordering restrictions apply within the same sheet, not across the import boundary. | §2 `#at-import` |
| Conditions | Without conditions the import is unconditional; media `all` has the same effect. If import conditions do not match, imported rules do not apply, as with equivalent `@media`/`@supports` wrapping. | §2.1 `#conditional-import` |
| Media versus supports fetching | A UA **may avoid** fetching while conditions do not match. A blocking supports condition instead means it **must not fetch** through this import, unless the resource is loaded through another link. Its `CSSImportRule.styleSheet` must be `null` even when another link loads that sheet. Do not turn the media permission into a universal mandatory fetch prohibition. | §2.1 `#conditional-import` |
| Condition interpretation | The media condition is a media query list. A declaration in `supports(...)` is treated as a supports declaration with implied parentheses. Full evaluation/syntax is delegated to Media Queries and CSS Conditional Rules; those specifications were not followed. | §2.1 `#conditional-import` |
| Repeated occurrences | Every import/link occurrence must behave as an independent stylesheet. This is a CSSOM/cascade requirement, not a requirement to transfer the bytes separately; appropriate caching may permit a single fetch. | §2.2 `#import-processing` |
| Inherited properties actually specified | The imported stylesheet inherits the importing sheet's **cascade origin** and uses its **encoding as environment encoding**. Neither statement specifies Fetch credentials, security origin, or referrer policy inheritance. | §2.2 `#import-processing` |
| MIME handling | Missing Content-Type metadata is treated as `text/css`. In host-document quirks mode, a resource whose response URL origin matches the host document's origin is also treated as `text/css`. Otherwise use its Content-Type metadata. Interpret `text/css` as a CSS stylesheet; other types are network errors. | §2.3 `#content-type` |
| Declaration order | Imported declarations occupy their import position. Independently linked sheets are concatenated in host-language linking order. The last declaration in document order wins at the order-of-appearance step, **after higher-priority cascade criteria**, not unconditionally. | §6.1 `#cascade-sort` |
| Import layers and failure | A layer assigned by an import participates in layer order even when loading fails, subject to the import's conditions. A bare layer assignment creates an anonymous layer; a named assignment targets the named layer. | §2 `#at-import` |
| Layer ordering | Layers are ordered by first declaration, with nested layers grouped in their parent before unlayered rules. Conditional groups contribute layers when true, except element-sensitive conditions must be accommodated globally. For competing layers, later layers win for normal declarations and earlier layers for important declarations. | §6.4.3 `#layer-ordering`; §6.1 `#cascade-sort` |

Implementation implications of these source rules: preserve import occurrence
positions independently of network completion order; do not use URL-based fetch
deduplication to erase separate CSSOM/cascade occurrences; and distinguish
conditional applicability from whether a transfer may or must be skipped. These
are implications, not results of exercising an import implementation.

## Exact fetch questions still unverified

| Question | What the authorized source establishes, and the remaining gap |
| --- | --- |
| Request mode | No exact Fetch `mode` or import-specific CORS algorithm appears in the three extracted sections. Neither `cors` nor `no-cors` is established here. |
| Credentials mode | No exact `credentials` value, inheritance rule, or credential handling across redirects is established. HTML link `crossorigin` is not proof of import behavior. |
| Inherited referrer policy | No rule identifies which parent-sheet/document/response policy supplies an import request's referrer policy or referrer. Encoding and cascade-origin inheritance cannot substitute for this missing rule. |
| Final-response URL bases | §2.3 explicitly uses the resource response URL's origin for its quirks-mode MIME exception. It does **not** specify the base used for relative import targets, nested imports, or URLs inside a redirected imported sheet. Do not generalize the MIME rule into a URL-base algorithm. This source navigation itself had no redirect. |
| Cycles | No ancestor-cycle detection, URL identity/canonicalization rule, redirect-aware cycle rule, termination behavior, or cycle-related CSSOM result is supplied in the extracted sections. The independent-occurrence requirement does not settle cycles and does not license global occurrence suppression. |
| Full fetch lifecycle | Request destination/initiator, response/CORS checks, redirect semantics, referrer processing, and load/error completion are not specified as an algorithm in these extracts. §2.2 expressly distinguishes stylesheet processing from resource fetching. |

No other specification was fetched. Native extracted links point to CSS Values
for URL syntax, CSS Syntax for environment encoding, Media Queries and CSS
Conditional Rules for conditions, and HTML/Fetch/DOM terms for MIME/origin
handling. These links are **unvisited leads**, not evidence that a particular
fetch algorithm has been located. A parent follow-up authorization must identify
and permit the primary stylesheet-fetch/CSSOM algorithm and any required
Fetch/referrer/URL cross-references before the missing fields can be answered.

## Evidence and execution

Artifact directory:
`node_modules/.cache/native-validation/native-css-import-fetch-source-september11/`

| Artifact | Evidence |
| --- | --- |
| `PROMPT.md`, `SOURCE-TARGET.json`, `PREFLIGHT.json` | Authorization copy, target and restrictions, released-runtime verification, clean preparation. |
| `live-INVOCATION.json`, `live-EXECUTION.json`, `LIVE-AUDIT.json` | One live child; exact command/environment; native/wire/mock counts; public destination; guard attempts; response and closed transport. |
| `response-1.body`, `response-1.headers.json`, `response-1.json`, `FINAL-RESPONSE.json` | Intact transport-decoded original HTML, selected non-secret response headers, byte counts and hashes. Response cookie values are not retained or used. |
| `live.jsonl` | Native reader receipt, original body capture, admission profile and heading outline. |
| `OFFLINE-INPUT.json`, `SELECTIONS.json` | Pinned receipt/body and three selections drawn from the accepted native heading outline. |
| `section-1.jsonl` | §2 and §§2.1–2.3; 32,014 bytes; 444 selected nodes. |
| `section-2.jsonl` | §6.1; 21,219 bytes; 268 selected nodes. |
| `section-3.jsonl` | §6.4.3; 12,282 bytes; 144 selected nodes. |
| `section-*-audit.json`, `RESULT.json` | Three successful native extractions, no network/process guard attempts, zero remaining nodes after each native document close. |
| `live-INTEGRITY.json`, `offline-INTEGRITY.json`, `*-{source,compiled,harness,preserved,workspace}.sha256` | Before/after release, new harness, old HTML harness/evidence, and existing workspace source/dist/shared-input pins. |
| `CHECKS.json`, `EVIDENCE.sha256`, `final-check.mjs` | Named final checks, resource accounting, and complete artifact/report digest ledger; ledger excludes itself. |
| `WORKSPACE-DRIFT.json`, `final-workspace.sha256` | Separately recorded concurrent integration changes; no claim that the working source tree stayed unchanged. |

Body: **328,235 decoded bytes**, **53,873 encoded bytes**;
SHA-256 `1fe27cdb69e4990a801bdad630d4bea755b4d472ff9aa23bf07f743056a3a2a1`.
Native reader receipt: **456,868 bytes**;
SHA-256 `4a1c2785d3636e4b95b73c59424c7c4e60f21a16f176059a6e20bfb790690dad`.
The receipt's captured bytes equal the preserved response body. No raw-body
search, trimming, substituted parser, or admission increase was used. Inspecting
the already-extracted semantic JSON is not another source navigation or native
section extraction.

Native `long-v1` reader admission remains unchanged: 4,000,000 response bytes,
50,000 document nodes, and the established token/depth/reader limits. The heading
outline scanned 11,740 nodes without truncation. Reader results are explicitly
partial semantic representations, omit scripts/styles and other configured
subtrees, and remain `extracted-unverified`, not visual/rendering equivalence.
No body/node limit or access restriction was hit.

Live phase ran from **21:23:39.391 to 21:23:39.700 UTC**; offline phase from
**21:24:17.976 to 21:24:18.587 UTC**, September 11, 2026. Each had one child with
capacity one, 30-second timeout plus 5-second termination grace, 6 MiB output/file
limits, private empty HOME/TMP and an environment allowlist. Offline execution
also had kernel socket denial and JavaScript network/process guards. The native
250 ms pacing setting was enabled; a one-GET result cannot measure inter-request
spacing. No SafeJS/page scripts, credentials, alternate browsers/tools, devices,
TTYs, retry, cleanup/deletion, or old-lane relaunch were used. Private directories
are preserved empty. Final checks enforce at least 64 MiB free and a lane at most
12 MiB. A preflight-only string-escaping syntax defect in the new harness was
corrected before any child launch; there was no live retry.

## Released runtime and limitations

The first final-check attempt detected working-tree drift between the live and
offline phases in `src/css-imports.ts` and `src/css-imports.test.ts`, consistent
with the user's concurrent local integration. Both phases individually retained
their before/after workspace hashes; cross-phase working-tree equality is **not**
claimed. `WORKSPACE-DRIFT.json` also records a final working-tree observation.
The released snapshot, compiled runtime, six execution-harness files, and old
HTML lane/evidence retain their original pins throughout. No integration changes
were reverted, bundled, or used as the research runtime, and neither research
phase was rerun to complete the audit.

Only `native-table-document-integration-september11-round04/snapshot01/dist`
inside the validation cache executed the research reader/replay. The old
`native-stylesheet-cors-source-september11/html` harness was reused as a template,
but its runtime was not used and its files/evidence remain unchanged.

Release commit: `2e88c1464b0975f1ad8a9e3e4eca122e648175b8`.
Gate base: `2ea6d50cc2ae5aecfb081f9b65cc2fb04c28bb3e`.
The gate-local `audit.mjs`, audit, summary, native result, source/compiled ledgers
and all 20 gate receipts match the authorized pins. All 1,059 source and 1,900
compiled files were checked; 24 owned source files plus the manifest were checked
against the release commit. Full hashes are recorded in the preflight/integrity
artifacts; the original gate audit was not rerun or rewritten.

The **10,123 pass / 0 fail / 2 existing exclusions**, **170 selected files / 169
strict roots / 574 manifest entries** are verified **historical release-gate
facts**, not tests newly run here. No builds or production tests ran. No
production/test/shared documentation edits, commits, pushes, or cleanup occurred;
only this new report and the authorized new evidence directory were created.
Outstanding import-fetch policy questions remain open and require separately
authorized primary-source research; no browser implementation acceptance gate
is claimed passed by this source retrieval.
