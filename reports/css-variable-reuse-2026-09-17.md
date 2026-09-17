# CSS custom-property reuse — September 17, 2026

## Outcome

Native styles now reuse equivalent custom-property maps across sibling elements
and pseudo-elements, without increasing existing resource limits. The new fixture
coverage proves CSS-backed block extraction for repeated declarations that
previously exhausted retained bindings. **The complete captured Grokipedia page
still does not pass styled extraction:** its next failure is the existing cascade
work budget during pseudo-element property processing. This report does not turn
that failure into a page compatibility success.

## Fresh source acquisition

Three exact stylesheet links in the previously captured DOM article were fetched
through the native stylesheet client, CSP/CORS policy and transport. Each returned
HTTP 200 and text/css after its matching zero-network proof. No article refetch,
redirect, retry, CSS import, font, image, script, SDK or challenge submission.

| Resource | Received UTC | Decoded bytes | Fetch result type |
| --- | --- | ---: | --- |
| katex-css | 2026-09-17T21:38:57.397Z | 23,352 | cors |
| activity-clg-css | 2026-09-17T21:38:58.668Z | 34,007 | basic |
| activity-b8hn-css | 2026-09-17T21:38:59.947Z | 38,158 | basic |

Both same-origin activity sheets contain the rule .block{display:block}; none of the
three contains an @layer token. This is captured source evidence, not a class-name
heuristic or rendered-style claim. The CDN request uses CORS with anonymous
credentials; all requests omit credentials. The API-required in-memory cookie
jars remain empty, accept no cookies and close. Capture/body hashes, exact URLs,
policy details and original source linkage are in the JSON report and saved audit.

## Implementation and limits

- A per-cascade cache keys results by parent-map identity and the exact ordered
  winning-declaration identities. All value semantics still use the existing
  custom-property resolver. Inputs are internal stable cascade values, not a
  cross-document or persistent cache.
- The trie includes parent roots in its 16,384-node cap. Saturated misses use
  uncached resolution, and cache traversal remains charged. Exceptions are not
  stored as successful results. Refresh creates a new cache.
- Elements and pseudo-elements share it; retained maps are counted once by
  identity. The 512-property, 16,384-retained-binding, 2,000,000-retained-code-unit
  and default 5,000,000 cascade-work limits are unchanged.
- Existing limit fixtures now construct distinct element/pseudo environments,
  rather than requiring duplicate immutable maps to waste the retention budget.
  They continue to assert limit errors and recovery without stale values.

## Validation

- Focused native: **671 passed / 0 failed in 14 files**.
- Full available explicit native list: **50425 passed / 0 failed in
  1006 files**. The canonical list has 1,028 entries; 22 committed paths
  remain absent. This is not a complete-manifest pass or SDK/live acceptance.
- Unchanged style integration with the new tests: **666 passed / 5 failed**.
  All five failures are new shared-map regressions. There are 35 new cases total.
- Build, affected-test typecheck, formatter and lint pass. Source/compiled
  qualification pins 1639/2420 files in a clean candidate with owned overlays,
  not the dirty root. Native child groups close and private HOME/TMP stay empty.

The identical saved HTML and all three unchanged CSS captures were replayed with
network denied. Before the fix: retained-variable limit. After the fix: cascade
work limit. The profiling stack locates the latter in pseudo-element property
processing. All 63 measured wrappers remain inline in the unstyled control; its
66,052-byte article-region Markdown and hash are unchanged between runtimes.
This root scope differs from the earlier 71,526-byte main-scope article report.
No styled-group count or full-page speed improvement is claimed.

A separate diagnostic-only DocumentStyles owner, explicitly given a 10,000,000
work ceiling, computes all 63 wrappers as block at **5,699,541 work units** across
1,485 rules/2,310 declarations/97,225 source code units. It performs no full
extraction and changes no production limit. This locates the remaining workload;
it is not a default-browser pass. Unsupported CSS constructs remain diagnosed.

## Preserved failures and environment

The first proof incorrectly required response object identity; v2 then rejected a
missing cookie jar before any HTTP client call. Both original failures remain,
with zero-wire evidence. The offline guard initially rejected Node's module file
URL. The first native run was 667/4: two new expected-string mistakes and two
existing duplicate-map fixtures; three formatting findings were also corrected.
Original failed artifacts were not rewritten. Three later v3 proofs and GETs pass.

Disk exhaustion interrupted one preparation before files were created. Only the
regenerable npm download cache was cleared through npm's offline cache-clean
command; installed packages, source changes and historical validation artifacts
were retained. New qualification candidates use private shared-memory storage.

## Next work

Profile and reduce repeated pseudo-element cascade work, then rerun complete
captured-CSS extraction and verify the actual paragraph boundaries. Do not infer
display semantics from names or raise limits solely to turn this page green.
The original 100-entry 33-useful/67-other results remain unchanged. Dynamic SDK/
HTML modules, varied interactive workflows, measured speed/access handling,
credentials/passkeys and the original research tasks remain open. Nothing here
claims Cloudflare/CAPTCHA bypass or overall browser completion.
