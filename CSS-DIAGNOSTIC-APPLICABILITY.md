# CSS diagnostic applicability

The native cascade now separates retained raw CSS diagnostics from diagnostics
that can affect the current document. This fixes whole-document layout rejection
caused only by unsupported declarations in unmatched selectors or provably
inactive media. It does not make unsupported active CSS advisory.

## Contract

- `DocumentStyles.metrics().issues` retains raw parsing/loading diagnostics.
- `DocumentStyles.metrics().applicableIssues` contains conservative current
  applicability counts. Both returned dictionaries are frozen.
- Formatting copies `applicableIssues`, with its existing `css:` prefix, instead
  of treating every raw issue as an active formatting limitation.
- A declaration diagnostic counts once per rule occurrence, not once per matched
  element. An unmatched rule retains its raw count without blocking formatting.
- An unsupported-only rule remains matchable: absence of supported declarations
  cannot erase its diagnostic when its selector can apply.

The optional seventh `parseCssRules` argument collects global diagnostics with
their media chain and enables frozen `CssRule.issues` maps for qualified rules.
Without this sink, prior raw callbacks, returned rule shapes and omission of
declaration-empty rules remain unchanged. The sixth import-resolver argument is
unchanged. Imported rules preserve their own source occurrence and the combined
link/import/nested-media conditions.

## Conservative boundaries

Supported false media can exclude a diagnostic. Unknown/invalid media cannot be
used as proof of inactivity. Matching still follows the existing supported media
profile, but potentially applicable unsupported declarations remain blockers.
A separately known-false condition in a media chain can prove the conjunction
inactive; the implementation does not guess inside an opaque unsupported query.

Unknown selectors retain a conservative selector diagnostic and their potential
declaration issues. Scanner recovery that could affect rule boundaries remains
global. Unsupported at-rules retain media-scoped global diagnostics. Existing
false-supports suppression remains unchanged.

Inline CSS errors and load/security failures remain applicable. This change does
not filter hidden-element or overridden-declaration errors, implement unknown
properties/selectors, fetch missing resources, solve CSP, or discard original
stylesheets. Existing non-CSS formatting limitations and width guards remain.

DOM, inline-style and viewport changes rebuild applicability through the existing
cascade invalidation. A newly matching unsupported rule must block the next
native pointer operation rather than reuse stale accepted geometry.

## Bounded work

Diagnostics aggregate by rule and parse invocation; there is no retained array
entry for every repeated scanner error. Existing rule/declaration/nesting/source
budgets still apply. Applicable count merging and selector matching consume the
existing CSS work budget.

Media evaluations are cached by exact query text for one cascade refresh and
current viewport only. Each lookup is charged; first compilation reserves
`query.length * (2 * cssMediaLimits.maxDepth + 8)` work units, matching the
existing import parser's conservative media-work convention. Cached query
diagnostics are replayed for evaluated occurrences. This is deterministic budget
accounting, not an elapsed-time benchmark or cross-viewport cache.

## Regression evidence

Private work lane: `node_modules/.cache/native-validation/css-diagnostic-scope-work-september11/`.

The exact native checkbox scenario fails on unmodified commit
`9b38bec02a06688f728a147ce75309e9ab112087`: at22:04:26.837–22:04:29.018 UTC on
September11,2026, `BrowserSession.click` reaches native pointer geometry and
throws the original width-profile error, before any new diagnostic API access.
This baseline selects one test;30 other cases in its file are deliberately
filtered, not passing assertions. Parent audit verifies1063 unchanged tracked
inputs and that the final regression differs only by configured formatting.

After the change, the genuine click dispatches native pointer events and checks
the checkbox. Raw diagnostics remain; changing its class to match unsupported
CSS makes the next click fail without changing checkbox state or dispatching
another click. Positive geometry is verified through the actual inline fragment,
not an invented block box or forced partial renderer.

The first focused run retains740 passes and3 failures: the pre-existing excluded
display assertion, an unknown-media applicability defect, and an inline-control
test incorrectly looking for a block box. The unknown-media defect is fixed and
the test checks real inline geometry. `fixed03` passes742/0 with1 existing
exclusion across14 selected native files, including24 parser and31 integration
cases. `fixed02` is preparation/formatting only. Earlier results remain intact.

The release gate is
`node_modules/.cache/native-validation/native-css-diagnostic-applicability-september11-round01/`.
At22:06:22.549–22:08:41.421 UTC on September11,2026, production build, strict
checking174 roots, formatting5 owned files and10390 native tests pass. There
are0 failures and2 unchanged existing exclusions,175 selected files and579 clean
manifest entries. The existing snapshot.test.ts strict omission remains; this is
not a whole-repository typecheck or every-manifest-test claim.

The audit verifies1066 source inputs,1908 compiled files,1060 unchanged tracked
inputs,5 owned source/test files plus the manifest, and both dirty production
residuals excluded and preserved. Source ledger SHA256:
`0b49489e38cc1a7e0c58f419d61e2305f4fe2932969bfe1d796c10906c153f50`;
compiled ledger:
`081950b7daa86aee4e27b28a9084b71cdd176c01e90112b5db2c56589cf11b42`.
All20 gate receipts are sealed.

Fresh OpenBSD validation is separate. Isolated tests do not establish website,
socket, device, credential, TTY or SafeJS acceptance. The original OpenBSD flow
and its failed link click remain unchanged in `OPENBSD-NATIVE-FLOW.md`.

The fresh10390 follow-up is now retained in `OPENBSD-CSS-APPLICABILITY-FLOW.md`.
It retrieves byte-identical original HTML/CSS and preserves8 raw property and1
raw value diagnostics, while applicable non-advisory CSS is1 property diagnostic.
The genuine click still fails; one table shell and unknown-media handling remain
in the census. Raw media warnings change from13 to15 as additional issue-only
rules are evaluated. Neither those raw counts nor the failed interaction is
rewritten into a pass. Parent verifies48 baseline/50 follow-up checks, four
receipt ledgers, original bodies and actual instrumented owner cleanup.
