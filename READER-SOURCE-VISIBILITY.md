# Explicit source-hidden reader filtering

The semantic reader defaults remain unchanged. Opt in to filtering subtrees
explicitly marked by the source:

```sh
node dist/scripts/research-browser.js --reader \
  --reader-visibility-policy source-hidden-v1 \
  --capture-body --format markdown PUBLIC_HTTPS_URL
```

The API equivalent is `readerVisibilityPolicy: "source-hidden-v1"` in research
execution options. The option requires the reader and composes with the existing
default/long-v1 admission rules and separately selected omitted-raw policy.
It does not authorize another request, retry, credential or page runtime.

## What it means

- Omit any subtree with a `hidden` attribute, including values such as `false`
  and `until-found`, or with `aria-hidden` exactly case-insensitive `true`.
- Do not treat CSS, `inert`, classes, loading placeholders or configuration-like
  text as hidden. An ARIA false descendant does not reopen an omitted ancestor.
- Apply before unwrapping unknown/remapped elements. Do not expose hidden
  MathML alternatives or description metadata. Literal markup in code or
  non-HTML responses remains text, not instructions for filtering.
- Retain source/text/token/raw/depth accounting and existing limits. Preserve
  legacy omission accounting inside templates and other already-omitted trees.
- Report `visibilityPolicy`, `sourceHiddenSubtrees` and, for HTML,
  `hiddenContentSemantics: "source-attributes"`. Literal responses retain policy
  provenance with zero source-hidden subtrees and false HTML-hiding semantics.
  Snapshot/search/CLI notices distinguish this partial behavior from CSS.

This is source filtering, not computed visibility, full HTML-tree equivalence,
rendered-value validation or a privacy boundary. Supported paragraph/list implied
ends are handled; other malformed source-hidden nesting can fail conservatively.
`hidden="until-found"` content is omitted without implementing a reveal action.
Use the unchanged default reader when hidden source is itself the research target.

## Admission and replay

Before selected HTML filtering, research navigation and replay build a separately
owned unfiltered reader tree with the same limits. Bounded whitespace-normalized
source diagnostics retain title/body challenge and login evidence. The requested
selector, section, heading outline or link diagnostics also run against the
unfiltered tree. Subsequent checks consider both original and filtered titles.
The temporary tree closes before filtered loading. Confirmed headers, rate limits
and existing barrier checks remain in place. Filtering is not a way around a challenge.

This adds an HTML parse and operation-specific diagnostic work when opted in;
it is not a speedup. An unfiltered
node/text-budget failure still stops the operation even if filtering could make
the eventual tree smaller. No response, document or extraction limit increases.
The bounded classifier remains heuristic, not universal challenge detection.
An unresolved unfiltered selector or capped unfiltered extraction supplies no
completed selection-level diagnostic; filtered selection validation, output caps
and classification still run. Reader/document failures are not swallowed.

Receipts preserve the explicit policy. Replay rejects unknown, contradictory or
stripped policy semantics, while accepting consistent top-only or reader-only
declarations. Ordinary failed/challenge capture admission remains closed.
Previously supported explicit output-limit selector recovery preserves the policy
and its original-failure provenance. Replay does not reinterpret an old capture
with a newly chosen policy or silently refetch a website.

## September 15, 2026 evidence

Six additional native public-page attempts returned five nonempty content results
and one Chrome 404: seven HTTP GETs including one Cloudflare redirect, no retries,
six verified captures and clean child/transport closure. MDN, SQLite and Python
returned HTML; Hugging Face and Cloudflare returned Markdown. Literal Markdown
fences/empty DOM titles are intentional current behavior, not rendered Markdown.
The Chrome error is not successful passkey documentation retrieval.

Nine saved-source controls compare the frozen baseline with the candidate:
default Markdown, reader reports, normalized DOM, headings and links are identical.
This compares current table-row-aware extraction, not a rewrite of the older
top-100 measurements. Selected effects include:

| Saved source | Default Markdown bytes | Selected bytes | Observed effect |
| --- | ---: | ---: | --- |
| PayPal | 11,784 | 11,547 | Twelve explicitly hidden intermediate digit spans disappear; the two explicitly non-hidden final spans remain. |
| Office | 52,523 | 41,839 | Some source-hidden navigation disappears; both CSS-only configuration payloads remain unchanged. |
| Microsoft | 17,999 | 17,963 | Some source-hidden decoration disappears; unresolved price placeholders remain. |
| Chrome 404 | 6,282 | 1,346 | Less hidden navigation noise; still an HTTP failure, not an article. |

MDN, SQLite, Python, Hugging Face and Cloudflare retain identical Markdown under
the selected policy. The PayPal result is a static source consequence, not a
validated financial offer or animation state. A separately labelled in-memory
PayPal response exercises policy capture and actual offline CLI replay; their
Markdown hashes agree. It is not a new live website request or a changed original
receipt. All original bodies and receipt hashes remain intact.

A subsequent fresh native request to PayPal's public homepage with the policy
returns HTTP200 and 11,547 Markdown bytes, records14 source-hidden subtrees,
and closes cleanly after one GET with no redirects or retries. The captured
350,420-byte body differs from the older saved control. Its own offline CLI replay
matches the new live output exactly; equal output lengths across different source
captures are not treated as equal hashes. This is an additional policy operation,
not a seventh new website. Total new live activity is seven navigations/eight GETs.

The explicit native selection passes **1,336 tests across 23 files**, including
165 new cases; all 1,171 baseline test statuses match. Build, formatting and lint
pass. The broader selected typecheck retains one unchanged baseline TS2345 in
`src/snapshot.test.ts`; a separate 22-file strict typecheck excludes only that
fixture and passes. That fixture remains in native test execution. No full
native-suite, rendering, interaction, runtime, credential or device pass is claimed.

Initial review found lost barrier evidence, an omitted-title debit regression and
one-sided recovery metadata inconsistency. The implementation includes fixes and
regressions for each. A follow-up review found a late targeted-marker gap; the
final candidate adds operation-specific unfiltered checks and dual-title tests.
Final independent static review finds no actionable defect in that scope; it
does not substitute for the separately recorded native and live checks.
Initial candidate type/lint issues and two new tests with
incorrect rejection-code expectations are retained in the local evidence.
Two offline proof assumptions also failed: whole-document JSON exceeded its
unchanged output cap, and process-global node IDs invalidated a raw DOM hash.
The corrected proof uses Markdown plus locally normalized rooted-DOM identities;
it does not raise a cap or alter production code to satisfy those comparisons.

The nine offline proof children include those two failed attempts; all are reaped
with zero guarded I/O attempts. The final baseline/candidate/CLI reproductions
pass with unchanged source/compiled pins and absent process groups. A separate
live verifier's cross-capture hash assumption was corrected without changing
the real receipt or repeating the website request.

Evidence is under
`node_modules/.cache/native-validation/explicit-reader-visibility-september15/`.
Machine-readable results are in `reports/reader-source-visibility-2026-09-15.json`.
The original top-100 matrix remains unchanged. Remaining work includes CSS-only
configuration noise, dynamic app shells, large-document admission and broader
research conclusions. The overall browser goal and all outstanding acceptance
gates remain open; nothing is pushed by this change.
