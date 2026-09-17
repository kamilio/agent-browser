# Source-index queries and document retrieval — September 17, 2026

## Outcome

A new bounded, source-only query API and offline CLI can search captured
`Search.setIndex(JSON)` assets without executing downloaded JavaScript. Two
Python query-to-document workflows now reach substantive documentation, with
independent source-to-Markdown comparisons. This is **literal stored-term lookup,
not full Sphinx search, rendered UI compatibility, or a new 100-site pass**.

See `SOURCE-INDEX-SEARCH.md` for usage and limits. The full browser goal remains
active, including dynamic sites, access/CAPTCHA friction, performance, actual
SafeJS, credentials/passkeys, missing tests and unfinished topic research.

## Implementation

- `selectJsonSourceSpans` performs one full strict JSON validation for up to 32
  pointers and returns exact spans, without a full tree or selected-value copies.
  Duplicate decoded keys anywhere are rejected. Missing paths are explicit nulls.
  Existing single-pointer behavior and default limits remain unchanged.
- Explicit `long-v1` permits 4 million UTF-16 units and 1 million JSON values;
  default remains 2 million units and 100,000 values. Depth remains 128.
- `searchSourceIndex` validates selected document arrays/postings, unions body and
  title postings per term, intersects across terms, and orders by title-membership
  count then document ID. No stemming, substring fallback, symbol search, inferred
  URL/anchor or site-relevance claim. Titles remain inert index-source strings.
- `research-source-index` checks source URL/MIME/hash and bounded strict UTF-8
  stdin, then emits explicit unverified source results. No network fallback or
  automatic upgrade of a blocked/failed navigation. Input, output, time and
  cancellation limits are enforced; no runtime dependency was added.

## Captured search assets

These are separate anonymous native-browser acquisitions, not an atomic site
snapshot. Original captures, refusals and source-discovery evidence are retained.

| Asset | UTC response time | Decoded bytes | Result |
| --- | --- | ---: | --- |
| `https://git-scm.com/pagefind/pagefind-ui.js` | 05:07:01.535 | 119,987 | HTTP 200, complete UI source; reader refuses JS MIME |
| `https://docs.python.org/3/searchindex.js` | 05:08:23.696 | 3,927,697 | HTTP 200, complete with explicit existing 4 MB profile; reader refuses JS MIME |
| `https://docs.python.org/3/_static/documentation_options.js?v=f83f2336` | 05:24:16.502 | 330 | HTTP 200, complete configuration; reader refuses JS MIME |
| `https://docs.python.org/3/_static/searchtools.js` | 05:24:18.975 | 21,782 | HTTP 200, complete source; reader refuses JS MIME |

The earlier default-2-MB Python acquisition remains a resource-limit failure in
`reports/source-search-assets-2026-09-17.md`; this later explicit-profile attempt
does not rewrite that evidence or raise browser defaults. Complete acquisition
does not itself constitute a successful reader or search operation.

The Python index contains 538 document names/titles and 536,551 JSON values.
Its SHA256 is `5f23cbcb2e6d806f9920d45e4a029f479eedac40e2bd8c1633575a9fcefdacfa`.
Independent strict JSON reference results match all five library query cases and
their limited-output variants. Final compiled CLI checks match those results:

- `asyncio` + `timeout`: 25 literal matches, including rank-2 `library/asyncio-task`.
- `json` + `load`: 26 matches, beginning with `library/json`.
- `json` + `loads`: zero literal matches. This deliberately exposes the absence
  of stemming, rather than silently rewriting the query or claiming site parity.
- Default-profile overflow and a wrong SHA256 both fail without a query record.

All five final CLI executions use kernel and JavaScript network denial; they make
zero requests and close their processes/groups. Saved-body checks are not live
search UI tests or additional downloads.

Source configuration and URL-construction statements establish the `.html`
layout for these ordinary relative docnames. The cache query is preserved exactly
on the options request; native report presentation alone redacts it. Sphinx's
actual matching also uses external language data, other index structures and
different ranking/fallback rules. Those capabilities remain unimplemented here.
Git's UI source contains a computed conditional module import; no actual Git
search data or working Pagefind search is demonstrated.

## Query-to-document checks

Document URLs are **computed from audited query entries and captured site layout**,
not literal HTML links or conventional endpoint guesses. No scripts, credentials,
redirects or retries were used. The two same-origin requests start 2.843 seconds
apart. Native outcomes remain `extracted-unverified`, not silently promoted.

| Document | UTC response time | HTML bytes | Markdown bytes | Exact code payloads | Eligible paragraphs retained |
| --- | --- | ---: | ---: | ---: | ---: |
| `https://docs.python.org/3/library/asyncio-task.html` | 05:38:12.256 | 177,603 | 65,798 | 34/34 | 139/139 |
| `https://docs.python.org/3/library/json.html` | 05:38:15.099 | 112,700 | 36,312 | 15/15 | 79/79 |

Independent Python HTML parsing and separate range verification compare all 49
main-region preformatted code payloads exactly after markup/entity decoding and
Markdown container removal. All 218 eligible paragraphs retain 40,586 normalized
prose characters. Eligibility requires at least 80 normalized characters and
excludes specified hidden/navigation ancestry; 232 short and 15 blocked-ancestry
paragraphs are outside this prose coverage. This is not full rendered/semantic
equivalence or independent factual verification.

Reviewed examples retain `asyncio.timeout`, exception/cancellation qualifications,
`json.loads`, `json.load`, custom hooks and untrusted-input warnings. No example
was executed. Both exact-command offline proofs pass; all four proof/live groups
and both authorized TLS requests close. The live runtime is release01; all its
2,368 compiled files also match final release07, which adds the offline CLI.

## Regression and lifecycle validation

- Final **release07: 1,696 passed / zero failed across 21 explicit native files**.
  Build, selected strict types, formatting and lint pass.
- **320 new cases:** 36 JSON span, 151 source-index and 133 CLI cases. All 1,376
  previously selected cases remain passing. This is not a full-manifest run.
- Final canonical manifest: **994 entries, 972 available, 22 missing**. Validation
  uses a clean HEAD-derived candidate with owned overlays, not the dirty root.
- Independent review identifies and fixes pre-commit CLI output lifecycle defects:
  cancellation must guard late write errors, including asynchronous destruction;
  the executable must terminate its own blocked stdio after failure.
- The two held-asynchronous-destroy tests fail against the preceding CLI candidate
  (131 pass / 2 fail), and pass with the final implementation. No blanket caller
  error guard conceals those cases.
- An isolated anonymous-pipe reproduction finds the old executable still alive
  after its timeout at 32 seconds; it exits only after the owned reader closes.
  The fixed executable exits with code 1 at **30.104 seconds**, while that reader
  is still open. Both groups ultimately close, with no cleanup signals. This is
  an actual pipe check, not a socket, TTY, website, credential or SafeJS probe.

Initial failures stay recorded: release02 has a sparse-array-fixture lint error;
release04 has an immediate-listener-cleanup assertion that must wait for deferred
error delivery. A failed formatting-context patch caused an unchanged release06
build, not a new native pass. The initial pipe preflight lacks a Python fcntl
constant and fails before creating a child; a fresh attempt uses locally verified
Linux command values. Original independent-review reports and document-review
normalization/range mistakes remain alongside corrected evidence.
The aggregate case comparison normalizes only one existing `new Date()` fixture's
serialized timestamp in its test name; both original names and results remain.

## Evidence and remaining work

Private reproducibility evidence lives under
`node_modules/.cache/native-validation/source-index-search-september17/`, with
source/compiled pins, exact invocations, native results, reference comparisons,
CLI refusal checks, pipe observations and review reports. External lanes retain
the original long-index capture and sealed 45-file Git, 65-file Python config and
83-file document inventories. Machine-readable summary accompanies this report.

No general performance improvement, lower blocking rate, CAPTCHA solution, full
search parity or dynamic-site acceptance is claimed. The historical 100-entry
33-useful/67-other review is unchanged. Next work includes broader real task
coverage, actual runtime acceptance and auditing other source CLIs for the same
cancelled-output pattern; this patch fixes only the new source-index CLI.
