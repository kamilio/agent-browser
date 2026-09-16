# Nested focus across saved pages and three live follow-ups

## Outcome

The opt-in nested article policy is now committed as `efcec30`. A prospective
comparison across **135 saved website responses** finds three changed Markdown
outputs, no new extraction failures and **no newly recovered failures** under
the same controlled reader interpretation. Three fresh native CLI requests then
retrieve article content from OutdoorGearLab, React Learn and PyPI JSON API docs.
These are repeat visits testing the new policy, not three newly covered domains.

**Content review found a regression:** GearLab's funding/affiliate disclosure is
present in its main header and v2 output but missing from both saved and fresh
v3 output. The optional selection needs correction; these three checks are not
a clean content-preservation pass despite their successful extraction operations.

This is narrower source selection, not a universal browser improvement or a new
top-100 success rate. The historical 33 useful / 67 other citation-entry verdicts
remain unchanged. Nonempty extraction is not proof of complete or correct content.

## Saved-response comparison

Use the protected release06 runtime subsequently committed as `efcec30`.
Recheck all 1,555 source inventory entries against that commit and all 2,328
compiled entries against their pinned files. Reprocess the 135 response inputs
with explicit `long-v1`, `separate-omitted-raw-v1` and
`source-hidden-inline-v1` policies. This does not preserve each original receipt's
individual interpretation and is not a fresh navigation or recovery receipt.

Of 135 inputs, 128 load as HTML. The other seven are rejected by this deliberately
HTML-only diagnostic profile; they include Markdown documentation and JSON APIs
with separately supported retrieval paths, not seven newly broken websites.
Compare v2 versus v3 in both complete-Markdown and separately labeled text-prefix
profiles, with the same 256,000-byte output bound and 50,000-node/128-depth limits.

Both profiles produce the same aggregate comparison:

- 128 successful extractions before and after; zero new failures or recoveries.
- Five nested-article selections: CNET, OutdoorGearLab, Go generics, React Learn
  and PyPI JSON documentation. CNET and Go retain identical Markdown.
- Three changed Markdown outputs, shown below. All five refined results match
  explicit extraction of their selected source node byte-for-byte.
- Source trees/revisions remain unchanged and every loaded document closes.

| Saved page | v2 Markdown bytes | v3 Markdown bytes | Reduction |
| --- | ---: | ---: | ---: |
| OutdoorGearLab homepage | 21,610 | 20,617 | 993 |
| React Learn | 17,992 | 16,795 | 1,197 |
| PyPI JSON API documentation | 24,754 | 20,682 | 4,072 |

The isolated comparison exits zero in 5.87 seconds with kernel/JavaScript network
denial, empty isolated HOME/TMP and closed process/group. This elapsed time is
not a controlled before/after performance benchmark. Matching a selected source
node establishes selection consistency, not independent semantic completeness.

## Fresh native CLI checks

First run three exact-command synthetic controls under network denial. Then make
one anonymous native GET per page, sequentially with two-second inter-job pauses.
Use default document limits and explicit v3/source-hidden-inline, separate raw
accounting, UTF-8 fallback, compact tables and table rows. The corpus's internal
long-reader profile does not silently become the CLI default.

| Page | Received September 16, 2026 UTC | HTTP | Decoded body bytes | Article Markdown bytes |
| --- | --- | ---: | ---: | ---: |
| OutdoorGearLab homepage | 23:10:11.019 | 200 | 203,577 | 20,690 |
| React Learn | 23:10:13.448 | 200 | 265,160 | 16,795 |
| PyPI JSON API documentation | 23:10:15.949 | 200 | 112,286 | 20,682 |

All three select `unique-article-in-main`. React and PyPI have the same complete
body hashes and selected Markdown as their saved counterparts. OutdoorGearLab's
body and content changed: retain that difference rather than claiming identity
with the older capture. The JSON report records both old and fresh hashes.

Each request has one observed, authorized TLS connection and matching request/
socket closure; all native transports and child groups close. No redirects,
retries, supplied credentials/cookies, scripts, other browsers or challenge
solvers. Native outcomes remain `extracted-unverified`, `contentSuccess: null`.
Capturing complete bodies adds output overhead; these are not transfer savings.
The runtime was still the tested, uncommitted candidate during these requests;
its exact source match to the later feature commit is independently rechecked.

## Independent content review

The reviewer compares each complete Markdown pair and independently parses the
three captured HTML bodies. GearLab loses a 993-byte prefix including its reader-
support/affiliate disclosure; the retained article still makes independence
claims. Treating all header text as irrelevant is the root cause, not a missing
site-specific keyword. Fix v3's outside-article context admission rather than
exempt this domain or silently declare the disclosure unimportant.

React loses a 1,197-byte site-footer suffix including copyright/logo attribution;
PyPI loses a 4,072-byte navigation/branding/contents prefix. The checked article
inventories retain GearLab's 2 paragraphs/58 headings, React's 53 paragraphs/13
headings/24 literal preformatted blocks, and PyPI's 26 paragraphs/6 headings/6
literal preformatted blocks. These are normalized text-presence and ordered code
checks, not a general rendered-page or source-truth guarantee. Footer attribution
loss remains an explicit provenance concern, not proof that all omitted text is
disposable.

Fresh GearLab source drift is confined to four homepage hero lines: link/image,
heading and description switch from a camping promotion to an electric-bike
promotion. The Markdown changes the corresponding four initial linked blocks;
the rest is identical. Its funding disclosure remains in the fresh body and is
still missing from fresh v3 output. No extra request was needed for this audit.

The exact review is retained as `CONTENT-REVIEW.md` in the evidence directory.
It is accepted as a diagnostic finding, not as approval of the content loss.

## Limits and next work

No production code changes in this follow-up. The feature's recorded 46,488
native passes and zero failures remain separate evidence; the suite is not rerun
here. Preserve its wrapper exit 1/count-audit distinction and 22 missing manifest
files. Source-authored hidden-content interpretation is explicit, not rendered
CSS visibility, automatic policy selection or a way around access restrictions.

First fix the confirmed outside-article disclosure/context loss with generic
regressions and saved/fresh source checks. Three narrower extractions do not fix
JavaScript shells, login requirements,
CAPTCHAs, request failures or the other historical unsuccessful entry pages.
Prioritize those remaining failure classes and concrete content tasks rather
than treating smaller output as broad completion. SafeJS scheduling, rendering,
real credential/passkey/device acceptance and unfinished research remain open.

Evidence: `node_modules/.cache/native-validation/focus-corpus-september16/`.
Original receipts and verdicts are unchanged. Cache captures are private local
evidence, not a portable full-response archive in this report.
