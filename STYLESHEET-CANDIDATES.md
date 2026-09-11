# Bounded stylesheet selector candidates

Status: isolated validation and same-body native browser replay pass. Fresh
Wikipedia testing loads the portal, fills its search input and issues the form's
GET request. The destination article returns HTTP200 but hits a further CSS-work
limit. None of these checks implies painting, full CSS support or CAPTCHA success.

## Implementation

DocumentQueries.matchingSpecificities no longer scans every element for every
eligible stylesheet rule. It uses direct positive id/class/type tests in each
selector's rightmost compound to find conservative candidate sets, then runs
the existing complete selector matcher and specificity calculation.

- Duplicate IDs and class tokens retain correct results and document ordering.
- HTML type selectors remain ASCII-insensitive; foreign local-name case remains
  significant. Conservative tag buckets may include false positives, which the
  complete matcher rejects.
- Grouped selectors merge candidates in document order and retain the maximum
  specificity of the branches that actually match.
- Unseeded logical, attribute-only, universal or pseudo-only branches use the
  existing full scan, rather than incorrect guesses about possible matches.
- Candidate indexes build lazily. Work for construction, lookup, merging and
  sorting is charged. Aggregate cached postings cannot exceed maxIndexedNodes;
  exceeding this bound falls back to a full scan, without publishing partial
  results or increasing any limit.
- Structural/attribute changes rebuild the relevant document index. Existing
  focus/pointer state refreshes retain structural candidates but re-run matching.
- querySelectorAll, querySelector, matches and closest keep their existing
  matching paths. No external dependency or alternate browser is introduced.

## Validation and preserved failures

The first preparation under
`node_modules/.cache/native-validation/native-selector-candidates-september11-round01/`
rejects an unlisted css-parser.test.ts selection before running tests. Round02
compiles production but stops because its snapshot lacks the committed
inline-styles JSON fixture. Both failed attempts remain intact.

Round03 includes that exact committed fixture at its original relative path:
`reports/cssom-native-cases-2026-09-02.json`. At 08:14:53.011–08:16:26.545 UTC on
September 11, 2026, it records:

- 6354 passing tests, zero failures and one previously reproduced baseline
  assertion excluded, across 109 explicitly selected native files.
- Production build, strict checking of 108 test roots and formatting of both
  feature files pass. The unchanged snapshot.test.ts typing error remains
  outside strict roots; this is not a whole-repository lint/typecheck claim.
- All 31 new candidate tests pass. Against unmodified production code at
  dbcae97, 30 pass and the bounded class-heavy stylesheet test fails with the
  original query-work error. Baseline evidence is under
  `node_modules/.cache/native-validation/native-selector-candidates-baseline-september11/`.
- 1006 source/fixture files remain unchanged during validation. The 1788 compiled
  files are pinned under `native-selector-candidates-compiled-september11`, with
  ledger SHA-256
  `87010190fc011c1525af6ae634e71533fc0dfaf49b0cfaacd79aa0672d04eabc`.

The accepted lane is
`node_modules/.cache/native-validation/native-selector-candidates-september11-round03/`.
Its network guards and synthetic tests do not establish live-site acceptance.

## Same-body browser recovery

`node_modules/.cache/native-validation/native-wikipedia-selector-replay-september11/`
records a separate guarded replay at 08:16:55 UTC. The captured 119573-byte
Wikipedia body now loads through BrowserSession and loadBrowserDocument under
unchanged budgets. Its SHA-256 remains
`6345affdc48c5e0c313f4e483c7a5c07d86f32aea8ee07ce6fd031094133e30c`.

Style metrics complete at 630524 work units within the unchanged 5000000-unit
budget, with 406 parsed rules and 1703 declarations. The document has 2708 nodes.
This contrasts with the old failure at matching call 193, not with a completed
old render or a wall-clock performance benchmark.

Unsupported CSS remains explicit: 39 invalid/unsupported value diagnostics,
217 unsupported properties, one unsupported at-rule, 29 media-query diagnostics
and 12 selector diagnostics. The replay's queryFailure field records the last
caught unsupported selector, `.frb-iad-dialog::backdrop`; browser-load.passed is
true and this is not the former fatal resource-limit failure.

One captured response is served; six external image-resource attempts are
denied without networking. No actual requests or network-guard attempts occur.
Source/build/parent pins and cleanup remain valid. Receipt SHA-256:
`2d580959bccd63a3089fbaa2026c89a880b3de28bd56c419ab211fc5a66f647c`.
Original failed live/diagnostic receipts retain their statuses and paths.

## Fresh native search flow

`node_modules/.cache/native-validation/native-wikipedia-selector-recovery-september11/`
records September 11, 2026, 08:17:16.826–08:17:18.093 UTC. The native browser:

- Loads the fresh portal response successfully, preserving 21 SVG namespace nodes
  and the same 630524-unit stylesheet work measurement.
- Discovers one enabled search input and its real containing form, fills the
  constant public query `large language model`, and prepares its actual GET
  action at `/search-redirect.php` with the observed form fields.
- Issues native requestSubmit. Two redirects reach the Large_language_model
  article with HTTP200, 1072049 decoded bytes and body SHA-256
  `9d982c95dfc3d1c55495399fbd0226f8e22dbaa4cf7aea73b172c82adc69bd15`.
- Receives two HTTP200 stylesheet responses, then fails with another
  `Query work limit exceeded`. The final article document and search-result
  content assertion do not complete; the overall flow remains failed.

Transport metrics record six requests including two redirects, 1409219 decoded
bytes, 238174 encoded bytes, zero mocked requests, zero active requests and a
closed transport. All response-header challenge classifications are null. No
credentials or scripts are used. Source/build pins and recorded cleanup checks
remain valid. This is partial functional progress, not completed live acceptance.

Receipt SHA-256:
`7a4311291fb6169e3eb35a445e7868d30cc505ed544534ec32fcfa8d3e2669be`.
Next diagnose the captured article together with its captured stylesheets under
unchanged budgets; do not mistake portal recovery for full website support.
