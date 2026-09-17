# Source-search asset investigation — September 17, 2026

**One native GET, zero complete new assets, zero successful searches.** This
investigation narrows the next step for Python/Git search; it does not implement
full-text search or execute site scripts.

## Python

The complete saved September 15 search page explicitly references
`searchindex.js`, resolving to `https://docs.python.org/3/searchindex.js`.
One anonymous native GET receives HTTP 200 headers at **04:48:29.905 UTC on
September 17, 2026**, declaring JavaScript MIME and gzip.

Decoding reaches **2,015,232 bytes**, exceeding the existing **2,000,000-byte**
response cap. The request fails with `resource-limit / network.response-decoded`;
there is no complete primary response or body capture. Total asset size, body
hash, wrapper syntax, JSON validity and search records remain unknown. The
observed decoded count is not the total asset size. No retry or limit increase.

A separate synthetic proof captures a small complete JavaScript-MIME body and
confirms reader refusal. That is not the live failure: the actual request stops
in transport before reader admission. The fixture's wrapper does not prove the
real asset's grammar.

## Git

The complete saved search page exposes `/pagefind/pagefind-ui.js`, a UI script,
not a literal result payload or explicit search-data asset. No data reference is
found in that saved HTML. **Zero Git requests** are made: no UI-script fetch,
guessed shard path, module import or endpoint probing. This is not a current-live
Git page audit or an inspection of its unseen external scripts.

## Next Evidence Needed

- Obtain a separately scoped, complete bounded Python index snapshot before
  choosing a strict source-data parser. Existing explicit asset-literal extraction
  has the same 2 MB whole-body bound and is not a search engine.
- Passively inspect Git's advertised UI script in a separate scope to discover
  actual references rather than guessing conventional paths.
- Keep demonstrated source-linked API/command indexes as narrow lookup workflows,
  not substitutes claimed equivalent to full-text search. Actual query/ranking
  behavior needs independent functional validation.

## Validation Boundaries

The sealed native runtime corresponds to commit `372a5c8`, before the new 429
header-retention patch. Source/compiled and input pins are verified; the final
command proof and live safety checks pass. Parent verifies all **77 sealed worker
artifacts**, the failed native receipt and lifecycle records. All five proof/live
child groups close. Earlier offline guard/exit-code assumptions are preserved in
the worker incident log; no website request is repeated.

No page scripts, SDK, credentials, alternate browser/client, identity changes or
CAPTCHA solving. The response-size failure is not evidence of crawler blocking.
No new native unit-test suite is run for this passive investigation.

Evidence: `reports/source-search-assets-2026-09-17.json` and private originals in
`node_modules/.cache/native-validation/source-search-assets-september17/`.
