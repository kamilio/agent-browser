# IANA native SVG website check — September 12, 2026

**Partial progress, not a website pass.** The native browser now commits the
IANA Example Domains document and decodes its original SVG logo. Its first
used-layout attempt still stops with `unsupported`: “Document width resolution
requires an issue-free supported formatting profile”. No link was clicked.

## Execution

- Native browser commit: `eaf47dc8a0e1081e31d86588c4c489c3b6d46429`.
- Fresh live supervisor: 22:43:28.830207–22:43:29.849931 UTC, September 12, 2026.
- One navigation to `https://www.iana.org/help/example-domains`; three HTTP 200
  responses, one document commit, one formatting inspection, one used-layout
  attempt, zero clicks. Title: `Example Domains`; 264 DOM nodes; 3,766 body-text
  code units. Formatting remains partial, not a complete rendered-page result.
- The original native transport and resource owners fetched the document, its
  stylesheet and SVG. No alternate engine/client, SafeJS, credentials, retries,
  redirects, challenge bypass or fabricated responses were used.
- Encoded payloads: 24,782 bytes; decoded: 128,167; combined: 152,949.
  All decoded bodies match the earlier IANA image-CSP check; the fresh encoded
  HTML differs. Earlier runs and their measurements remain unchanged.

## Image and remaining layout gate

The original image at `/static/img/iana-logo-header.426b3ac01d35.svg` completes
as origin-clean `image/svg+xml`, with natural dimensions 234×72. The native
image owner records 32,870 received bytes, 67,392 decoded bytes and 1,873,744
decode-work units. External-doctype metadata is ignored without fetching it.
This advances beyond the previous unsupported-SVG failure before commit.

Applicable stylesheet diagnostics are nine unsupported at-rules, 43 unsupported
properties, 32 unsupported/invalid selectors, 11 unsupported/invalid values and
one unsupported/invalid media query. These are not the raw whole-sheet counts
(which include 276 property and 42 value diagnostics). Formatting additionally
reports 22 float and four display coordination markers. Native float/flex/grid/
table coordinators already exist; these markers do not prove those engines are
absent. The next task is identifying the exact applicable CSS and formatting
constraints, not suppressing diagnostics or dropping stylesheets.

The first failure occurs at 22:43:29.788 UTC. No further native page analysis or
interaction follows it; only owner cleanup is observed. No rate/access denial,
challenge or native resource-cap exhaustion was reported.

## Evidence and limits

Private evidence: `node_modules/.cache/native-validation/native-iana-svg-september12/`.
`RESULT.json`, encoded/decoded bodies, ordered headers, progress log, execution
receipts and read-only `verify.mjs` retain this fresh attempt separately.

Before/after checks verify 1,210 source files, 2,028 compiled artifacts, 27 tested
inputs, 30 actual Git objects, 1,183 unchanged baseline inputs, and the original
20 gate receipts and commit proof. The preceding selected native gate was
16,405 passing cases, zero failures and two unchanged exclusions across 315
selected suites; 378 other manifest entries were not run. That gate was not
rerun here and is not evidence for broader website or device acceptance.

After a 50 ms settle, observed session, transport, request queue, document,
image, interaction, cookie and storage owners are closed with zero active or
retained resources. Counters retain one navigation/commit and three requests;
image decode-work remains a historical counter, while decoded bytes return to
zero. The SVG decoder's private internal DOM was not independently instrumented
in this live run. Child process groups are absent and private HOME/TMP are empty.

Limits remain 32 GETs, one concurrent request, 250 ms spacing, 2 MiB per response,
8 MiB combined encoded/decoded bytes, 45 seconds plus five seconds cleanup,
6 MiB per artifact and 16 MiB per lane. TLS/public-address checks, the truthful
`AgentBrowser/0.1` identity, omitted credentials and original CSP remain enabled.
This is not a full-page layout, click/navigation, script, accessibility, pixel
comparison, authenticated website, passkey or unrestricted compatibility pass.
