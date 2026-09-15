# Oversized HTML workflows — September 15, 2026

## Result

Retested all five unresolved transport cases from the original 100-page corpus.
**All five now have complete captured bodies in this follow-up; four yield sampled
useful source content.** This is not a claim that their default failures vanished
or that all100 pages now work. The original matrix remains unchanged in
`reports/agent-citation-pages-2026-09-15.md`.

The default-prefix pass and explicit-workflow pass are separate observations,
not same-body comparisons. No production code changed. The existing bounded
`long-v1` workflow—not a new default or automatic fallback—obtained the larger
HTML sources. Operational steps are in `LARGE-PAGE-WORKFLOW.md`.

## Every target

| Target | Complete body bytes | Heading count | Selected Markdown bytes | Result |
| --- | ---: | ---: | ---: | --- |
| `https://play.google.com/` | 2535808 | 0 | not admitted | Complete body; empty heading outline; generic replay rejected |
| `https://www.techradar.com/` | 2319281 | 52 | 131592 | Long capture + offline body selection: useful source |
| `https://www.tomsguide.com/` | 2828161 | 28 | 108446 | Long capture + offline body selection: useful source |
| `https://www.cnbc.com/` | 2739182 | 13 | 30962 | Long capture + offline body selection: useful source |
| `https://www.comparor.com/` | 90412 | n/a | 12160 | Default CLI: useful product-offer source |

TechRadar contains technology news/review/deal links and descriptive summaries.
Tom's Guide includes prose insight updates, topical listings and deal material.
CNBC supplies business-news headlines, authors and links. Comparor includes named
product offers, stores and displayed pricing/discounts beyond category navigation.
Reviews sampled first/middle/end content and targeted Tom's Guide sections; they
are not full-article, factual/price, live-widget, purchase or chatbot validation.
Membership prompts, navigation and other source clutter remain in several outputs.

## Default pass and guard failure

At 18:49 UTC, Google Play, TechRadar, Tom's Guide and CNBC again exceeded the
unchanged2,000,000-byte decoded ceiling. All four yielded65,536-byte diagnostic
prefixes, but none reached a body tag or closing head tag. These prefixes contain
head metadata/CSS/scripts, **not useful page-content recovery**. No incomplete
prefix was admitted to a loader, complete-body capture or successful replay.

Tom's Guide now produced a decoded-limit error instead of the earlier historical
timeout. This is not a pinned same-response timing comparison or proof that the
prefix feature caused the change.

Comparor's first pass reached302 with a /us/ redirect, then our observer denied a
Cookie header on the second request. The custom experiment wrapper had not
overridden the top-level cookie context: session resourceCredentials omit alone
does not suppress top-level redirect cookies. These were server-set cookies in a
fresh empty profile, not accessed stored credentials; values were not logged.
Retain this guard failure and do not attribute it to the site. The corrected
follow-up uses the existing production research CLI, which explicitly omits
credentials, and succeeds with the default profile.

## Explicit larger profile and offline extraction

At 18:52 UTC, four separately selected long-profile native CLI navigations used
existing4,000,000-byte response/capture ceilings and bounded source/reader work.
The8,000,000-byte session cap,15-second network deadline and20-second navigation
deadline remain. Comparor uses the ordinary2MB CLI profile. Each child has empty
HOME/TMP,192MiB heap,45-second outer deadline; launches are serial with two-second
gaps. Only same-origin HTTPS GETs are allowed. No page scripts/SafeJS, stored
credentials, authentication/forms, challenge solving, alternate browser/client,
listeners or TTY are used. The guard-denied anonymous cookie attempt stays visible.

Host-audited complete receipts/body hashes then drive three ordinary native
offline body selections with explicit Markdown. Existing source visibility and
barrier checks remain, with256,000-byte extraction and327,680-byte replay-output
limits. A fourth isolated process verifies Google's expected admission rejection.
Kernel network denial and JS guards record zero attempted network operations.
No mocked network response or modified historical receipt is used for recovery.

Totals: **10 live navigations,16 request-start events,15 observed responses,
six redirects,one guard denial,four diagnostic prefixes,five complete bodies**.
All16 requests and observed sockets close; all10 live and4 offline children/groups
are absent after completion. Offline selections perform zero HTTP requests.

## Google Play: the remaining workflow issue

The2,535,808-byte complete source loads successfully with6,861 emitted reader text
code units. Heading discovery scans2,758 nodes but returns zero entries, not a
truncated outline. The native heading-only operation truthfully reports
empty-extraction/contentSuccess false. Generic replay therefore returns
evidence-only/native-failure and the selection helper rejects policy-denied.
The negative control passes; it is not a content-success result.

An empty heading discovery is not the same as an empty or uncaptured page. The
next fix should provide an explicit, failure-preserving empty-outline selector
path with strict complete-body, status, header, identity, closure and barrier
validation. Do not fabricate headings, rewrite the outcome or broadly admit
failed/partial captures. No such recovery is implemented in this report.

## Provenance and outstanding gates

Runtime commit: `a12806cb2da3e874a719d535ad6e3d574abc0a10`. All1479 committed runtime
source/script/config files and the sealed source/compiled manifests match the
reused clean build. No new compiler/unit-test pass is claimed: the preceding
selected native result remains871pass/two unchanged failures, including60new
tests; its build/types/format/lint results are reused, not rerun here.

The adjacent JSON pins scopes, receipts, selected content, guards, closure and
reviews under `node_modules/.cache/native-validation/oversized-html-followup-september15`. Earlier reports and
all original42 tracked/697 untracked working files remain intact. No push.
Broader100-page compatibility/access restrictions, interaction/passkey and
SafeJS gates remain open. Observed timings are not a performance benchmark.
