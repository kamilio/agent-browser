# Website test expansion — September 12, 2026

Later same-day evidence and the **70 attempted-host** total are recorded in
`WEBSITE-TEST-FOLLOWUPS-SEPTEMBER-12.md`. The original snapshot below is retained.

Starting coverage remains **66 attempted exact hosts**, not66 working websites.
The historical host list is in `WEBSITE-TEST-INVENTORY.md`, with additions and
their actual outcomes in `WEBSITE-TEST-EXPANSION-SEPTEMBER-11.md`.

After the two newly verified flows below, combined coverage is **69 attempted
exact hosts**. The three additions are `www.netbsd.org`, `man7.org`, and the
pre-wire-rejected image host `c.statcounter.com`. As in the earlier CDN case,
an observed rejected subresource attempt counts as an attempt, not reachability.
Machine-readable additions: `reports/website-test-expansion-2026-09-12.json`.

## Man7 manual and rejected image host

`MAN7-MANUAL-FLOW.md` records the fresh00:58 UTC attempt on audited11268 release.
Three man7.org GETs return HTTP200: manual HTML, original CSS and a PNG cover,
22573 encoded/37435 decoded bytes. An original-loader tracking-image request to
c.statcounter.com is rejected by the harness before native transport admission.
No wire request reaches that host. This stops the navigation with zero commits,
anchor inspections or clicks; it is a test policy boundary, not a server
rejection, CAPTCHA or demonstrated layout defect. A further discovered relative
stylesheet remains unfetched. No resource removal, allowlist expansion or retry
is used to manufacture a working result.

Parent verifies24 evidence checks,54/56-entry ledgers, encoded/decoded body
equality, gzip/header/accounting claims and exact archive/report metadata. The
document reaches zero owned nodes after one bounded settlement observation;
event/control/image-owner cleanup remains **unproved**, because the failed load
never reaches completed-page instrumentation. An offline seal precheck rejects
abbreviated report timestamps; its original draft/checker are byte-preserved,
and full dates are added before sealing without another native run. These two
host additions raise the preceding67-host coverage to69, not69 working websites.

## NetBSD guide

`NETBSD-GUIDE-FLOW.md` adds `www.netbsd.org`, bringing verified attempted-host
coverage to **67**, not67 working sites. The fresh00:53 UTC native flow uses
audited11268 release8daf14b. The guide and original global CSS return HTTP200,
83873 encoded/decoded bytes and zero mocks. Native availability is checked
before deduplicating96 of588 anchors; visible Introduction link e129 is chosen.
Its one genuine click fails the supported width-profile guard before pointer
dispatch or destination navigation. Applicable CSS diagnostics,12 unsupported
presentation hints and2 deferred table nodes remain; no sole-cause attribution
or float-specific defect is inferred from that separate census.

Parent independently verifies51 evidence checks,43/54-entry ledgers, exact
body/header/archive cross-file metadata and actual document/event/image/control
cleanup. A stale September11 path breaks final packaging, not the native flow;
all four partial-output/draft versions are byte-preserved before filesystem-only
completion. Parent verifies both old claims against the archived draft and new
claims against the actual report. Its own initial check assumed a nonexistent
old report.bytes field; the original verifier and correction note are retained.
There is no native retry, website restriction, capacity change or live validation
of the newer11331-check computed-display release.

## Curl captured-document follow-up

`CURL-LINK-SELECTION-REPLAY.md` records the isolated00:16 UTC replay on the same
11025 release as the original live attempt. Two intact original response mocks
supply28849 decoded bytes; there is zero wire or new host coverage. Checking
native visibility before deduplicating destinations excludes FAQ occurrence e82
beneath a closed details menu and selects visible FAQ e408. One genuine click
then fails the width-formatting guard; no FAQ request or mouse dispatch occurs.
This explains selection behavior on the captured page, not a successful live
navigation. Independent CSS, flex, image and overflow limitations remain.

Parent verifies runtime/body/selection/cleanup evidence and38/44-entry ledgers,
but **does not accept every packaging-provenance claim**. The archived draft's
embedded hash names a byte stream with one more final LF than the saved file.
`CURL-LINK-SELECTION-SEAL-NOTE.md` gives the additive explanation and limits;
the original incorrect receipt remains unchanged. Its new8/10/12-entry ledgers
and46 unchanged source pins verify. A separate verification-text quoting erratum
is retained in the note's private lane. No website/native replay is repeated to
clean up these packaging defects, and no all-green evidence claim is made.
