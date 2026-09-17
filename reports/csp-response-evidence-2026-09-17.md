# CSP response evidence and native capture checks — September 17, 2026

## Why this change

The preceding OutdoorGearLab script probe detected enforced CSP but retained no
directive values. Historical v1 research receipts did not select either CSP
header. Their empty omission lists therefore could not establish CSP absence.
Disabling the script loader's conservative check on that evidence would be
unjustified. This change preserves the missing diagnostic information instead.

## Implementation

`selected-response-headers-v2` adds separate enforced and report-only CSP fields.
Policies are kept exactly, including multiple values and order, under a maximum
of 16 values and 16,384 cumulative UTF-16 code units per CSP field. Bad or
oversized fields are wholly omitted and explicitly marked, never clipped.
The original five field limits and the overall metadata budget are unchanged.

The codec validates the marker's own allowlist and budgets. Historical v1 and
unmarked receipt contracts remain unchanged; v1 cannot carry newly added CSP
fields. No arbitrary/cookie/authorization headers are added, and no CSP policy,
page script, SDK code or report endpoint is executed by capture or replay.
See `RESEARCH-CSP-EVIDENCE.md` for the absence/omission/version distinctions.

## Isolated qualification

Clean baseline `3b334f5` plus six explicit source/test overlays passes **1,228
tests with zero failures across 13 selected native files**. The new dedicated
receipt compatibility file contributes 84 cases; header unit and integration
tests also expand. Build, selected test types and scoped format/lint pass.

The candidate has 1,615 source pins and 2,396 compiled pins. Its 1,010-entry
canonical native manifest has 22 paths absent from the isolated committed tree;
those paths exist in the dirty workspace. This is selected qualification, not
a full-suite, dirty-runtime, actual-SDK or live-interaction acceptance claim.
All observed test/quality processes close and the native runner's private
HOME/TMP remain empty.

## Historical compatibility

All 100 original September 16 corpus receipts are rehashed against their recorded
review pins and passed through both the previous and candidate compiled codecs.
Their complete admission results match: **61 validated captures and 39
evidence-only results**. The inputs comprise 96 v1 markers and four unmarked
receipts. This check runs under kernel and JavaScript network denial, makes no
new requests, and leaves every original receipt unchanged.

Admission is not useful content: the historical independent website assessment
remains **33 useful / 67 other**. This is not a new 100-site crawl or rerating.

## Fresh native website checks

Two newly scoped anonymous native GETs run on the qualified candidate. Each
target first passes its own kernel/JavaScript-denied synthetic proof. Both live
responses are HTTP 200, carry a complete v2 capture, and survive receipt/body
identity checks and replay admission without another request.

| Target | Response time, September 17 UTC | HTML bytes | Markdown bytes |
| --- | --- | ---: | ---: |
| OutdoorGearLab homepage | 12:13:20.885 | 203,555 | 22,675 |
| Target homepage | 12:13:57.980 | 393,778 | 8,438 |

Both responses contain enforced CSP and no report-only CSP field. Neither policy
is omitted or clipped. OutdoorGearLab's captured policy includes source,
framing and form directives; its script directive is `script-src https:
'unsafe-eval' 'unsafe-inline'`. Target's entire captured policy is
`frame-ancestors 'self' https://*.target.com;`. The current loader refuses both
because it tests enforced-header presence rather than directive applicability.
The Target case supplies a concrete next compatibility target; this change does
not yet loosen that check or claim embedded-document policy enforcement.

Parent inspection finds review/category text and links in GearLab's extraction.
Target retains promotional sections, category links and product teasers, but also
repeated `Loading...` placeholders, duplicated labels and imperfect entity text.
These are useful source-level observations, not complete rendered storefronts,
tested search/shopping actions, verified prices or endorsements of source claims.
Different body bytes and extraction paths mean the earlier GearLab measurement
of 22,688 bytes is not rewritten or treated as a before/after quality comparison.

Exactly two live wire GETs occur, with no redirects, retries, subresources,
credentials, SDK, website JavaScript, alternate clients or challenge bypass.
Both observed requests/sockets and all child groups, native sessions and tracked
documents close. Private HOME/TMP remain empty. Each live allowance is spent.

The original harness's first offline proof failed because Node's strict deep
comparison distinguished the codec's intentional null-prototype snapshot from
parsed JSON. That failed proof made zero network requests and is retained.
A separate v2 harness compares the entire serialized primary response, records
the prototype independently, and passes both proofs before the live requests.
Browser source and native qualification were not changed by the harness fix.

Evidence is retained in `csp-evidence-live-september17/` (failed original proof)
and `csp-evidence-live-september17-v2/` (successful proofs and live checks), beneath
the same private native-validation cache.

## Outstanding work

The classic-script loader still conservatively declines enforced CSP. Positive
live script loading, complete CSP handling, actual SafeJS scheduling, interactive
site tasks, access challenges, real credential/passkey/device acceptance and the
unfinished research topics remain open. The full browser goal is not complete.

Private qualification and historical comparison evidence is retained in
`node_modules/.cache/native-validation/csp-evidence-september17/`.
