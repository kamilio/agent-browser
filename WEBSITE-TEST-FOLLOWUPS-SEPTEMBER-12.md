# Website follow-ups — September 12, 2026

Verified attempted-host coverage is now **70 exact hosts**, not 70 working
websites. This supplements the earlier 69-host snapshot in
`WEBSITE-TEST-EXPANSION-SEPTEMBER-12.md`; its original measurements remain
unchanged. The sole new host is `www.debian.org`. The repeated Man7 and rejected
`c.statcounter.com` image attempts add no new host.

Machine-readable records: `reports/website-test-followups-2026-09-12.json`.
Both fresh flows use actual audited runtime `99108ab` with 11492 selected native
passes, not the later 11504-check regression-coverage gate. The latter has identical
compiled production bytes but does not relabel historical live execution.

## Man7: optional image no longer aborts the page

`MAN7-OPTIONAL-IMAGE-FLOW.md` records the once-only 02:09 UTC follow-up.
The original tracking image is rejected locally before transport without globally
aborting navigation. It remains a native broken image with `policy-denied`; no
image is removed, rewritten or replaced by a fake successful response.

Four genuine HTTP 200 GETs load the initial manual, two original stylesheets and
the cover image: 23256 encoded/39562 decoded bytes, zero mocks. The initial
`ls(1)` document commits. Native availability is checked before deduplicating all
64 inspected anchors. No eligible `stat(1)` exists; the genuine `date(1)` link
`e472` is selected and clicked once. That click fails the native layout guard,
with no destination request or history change. This is still an incomplete flow.

The separate census finds applicable CSS issues plus display, collapsed-table
border, fieldset and noscript limitations. It does not isolate one sufficient
fix. Actual document, image, event and control-owner cleanup is observed.
Parent rechecks all 36 assertions, 104/106-entry ledgers, raw/header/decoded-body
claims, original archives, report hash and unchanged runtime. No retry occurs.

## Debian: bounded resource loading stops before commit

`DEBIAN-DOCS-FLOW.md` adds `www.debian.org` through the once-only 02:15 UTC
navigation to its documentation index. Eight GETs return HTTP 200: one document,
six original-loader stylesheets and one PNG, totaling 17557 encoded/52649 decoded
bytes. The ninth adapter entry, `/font-awesome.css`, is rejected before wire
admission at the probe's eight-request cap. There are zero mocks or redirects.

The page does not commit; no title/history, anchor discovery, genuine click or
formatting census is claimed. This is a test-budget stop, not demonstrated native
layout failure or working-site acceptance. Document and image owners close after
one bounded settlement observation; event/control cleanup remains unproved.
No cross-origin image branch is exercised and no challenge-absence claim is made.
Parent rechecks all 28 assertions, 83/85-entry ledgers, exact body/header/metadata
claims, original archives, report hash and unchanged runtime. No retry occurs.

## Next Gates

Continue real-site coverage and isolated captured-page investigation without
discarding styles, faking assets, widening origins or bypassing restrictions.
Man7's remaining CSS/table/element guards need their own regressions. Debian
needs a separately scoped resource-budget follow-up if further loading is to be
tested; this failed eight-request run must not be relabeled. Native test passes
remain separate from live website, real runtime/device and access-challenge gates.
