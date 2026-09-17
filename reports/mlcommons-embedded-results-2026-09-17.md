# MLCommons embedded results — September 17, 2026

## Finding

One source-advertised Tableau iframe was fetched through the repository's native
browser at **06:45:23.752 UTC on September 17, 2026**. It returned HTTP 200 and
6,569 decoded HTML bytes, but **zero numerical benchmark rows**. Its 138-byte
Markdown extraction is an “Unexpected Error” template hidden by the source's
`#tabBootErr { display: none; }` stylesheet rule. The tested reader disables
styling, so it exposes the template. **This does not establish that the live
application actually failed**, and the text is not useful benchmark content.

This adds one narrowly scoped website check, not a new full-corpus run. It does
not change the historical 100-entry agent-citation result of 33 useful pages.

## Source and request provenance

The iframe is explicitly advertised in the saved September 15 MLCommons
Datacenter document, at bytes 75711–76355 (end exclusive). The historical receipt
and body hashes were checked against the sealed methodology-workflow evidence.
HTML entity decoding of `&amp;` preserves the original query exactly. No endpoint,
export URL or parameter was guessed or added.

The request targets `public.tableau.com`, path
`/views/MLCommons-InferenceDatacenter/MLCommons-Inference`. The exact public
embed parameters are retained in the JSON companion and private request proof.
The browser intentionally redacts query strings in its report; the native
request guard and HTTP observer verify the original full path and query.

## What the document contains

- Empty visualization, toolbar/navigation and main-content placeholders.
- An empty `tsConfigContainer` and ten inert static configuration fields, parsed
  offline with strict bounded JSON checks. No system-performance values.
- One literal PreBootstrap JavaScript asset, two CSS links and analytics
  references, all unfetched.
- A gallery navigation link and a `vizql` prefix—not a complete benchmark-data
  endpoint or static export.

HTML has no tables or table rows. Asset versions, CSS/SVG dimensions and the
browser-support flag `performanceSupported` are not benchmark results. No
publication/update date for the Tableau workbook is established by capture time.

## Validation and limits

The exact synthetic command passed before the one real GET. The runtime is
committed `5ca9d5a`, with 1,593 source and 2,372 compiled hashes checked before
and after. This is **not** a live test of the later output fix in `a035372`.
Request/TLS/socket/process closure and empty private HOME/TMP passed. There were
no redirects, retries, credentials, follow-up assets, page scripts, SDK/SafeJS,
real TTY or alternate browser/client. Existing response/extraction and supervisor
limits were retained. Three offline harness incidents and their failed originals
remain recorded; none consumed an extra live request.

The worker sealed 64 evidence files in
`node_modules/.cache/native-validation/mlcommons-embedded-results-september17/`.
The JSON companion points to the original evidence, its inventory and seal.
No browser source or historical measurements changed for this report.

## Next requirement

Recovering actual system-performance rows needs a source-advertised static export
or separately scoped dynamic initialization and data requests. This response
does not advertise a complete data/export URL. A `vizql` prefix is insufficient
to invent one, and another identical GET is not a demonstrated solution.

The reader also needs stronger stylesheet-aware visibility before source-hidden
templates can be reliably distinguished from rendered messages. This capture
documents that limitation; it does not implement CSS rendering or solve dynamic
Tableau compatibility. Hardware recommendations, benchmark comparisons and the
broader browser goal remain unfinished.
