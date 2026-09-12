# Website test inventory — September 12, 2026, seventh update

**77 recorded attempted hosts,not77 working websites.** The full normalized
union is in `reports/website-test-inventory-2026-09-12-seventh-update.json`.
The previous75 are unchanged. This update adds one contacted website,
`www.libarchive.org`,and one locally denied image host,`s3.amazonaws.com`.
Counting the denied subresource follows the earlier`c.statcounter.com`
entry;it does not mean S3 was contacted or tested. Repeated Netlib and the
captured GIF source check add no host. Working-website count remains unknown.

## Netlib: bounded flow passed

Native UTC:2026-09-12T08:42:03.271Z through 2026-09-12T08:42:04.137Z.
The committed12470/e8375ac native runtime loads the homepage,discovers an
available FAQ link,and activates it with one genuine click. Two documents
commit;the destination is`https://www.netlib.org/misc/faq.html`,title
`Netlib FAQ`,with changed document identity and session history index1/length2.
The native destination text observation contains11352 code units.

Four real HTTP200 GETs transfer34,762 encoded/decoded bytes,with zero mocks,
retries or rejected adapter entries. Both documents load the147×148 GIF with
one frame and explicit initial-frame/no-animation metadata. The old12037 and
12350 failed Netlib flows remain historical failures;they are not rewritten.
This result covers that one interaction,not arbitrary links or whole-site parity.

Parent verification checks12 actual Git blobs and37 readonly evidence checks.
Report:`NETLIB-GIF-FLOW.md`;verified at2026-09-12T08:43:29.555Z.

## Libarchive: origin boundary stop

Native UTC:2026-09-12T08:42:36.618Z through 2026-09-12T08:42:36.964Z.
Two real HTTP200 GETs load the6635-byte homepage and690-byte stylesheet from
`www.libarchive.org`:7325 encoded/decoded bytes. Its original loader requests
an S3-hosted GitHub ribbon image;the fixed single-origin harness rejects that
third adapter request before transport. There is no S3 wire request,no committed
document and no click. No retry or origin expansion is attempted.

This is a harness permission boundary,not evidence of a Cloudflare challenge,
CAPTCHA,server rejection or a diagnosed native rendering failure. Its retained
source census cannot substitute for an accepted live navigation flow.
Parent verification checks12 actual Git blobs and34 readonly evidence checks.
Report:`LIBARCHIVE-DOCUMENTATION-FLOW.md`;verified at2026-09-12T08:44:28.259Z.

## Code and isolated evidence

GIF-IMAGES.md records120 new cases,573 focused passes and12470 selected native
passes with two unchanged exclusions. Build/strict/format and source/compiled
audits pass. Timed GIF animation remains unsupported. A separate old Node
capability assertion outside the selected gate still reproduces49/1.

NETLIB-GIF-SOURCE-CHECK.md separately decodes the exact historical6710-byte
GIF into147×148 pixels using336632 work units. It makes no HTTP request,loads
no document and performs no click. It is not counted as new website testing.

All historical reports and source/response hashes are preserved. Provider,
passkey/device,TTY,realSafeJS and challenge/human-handoff gates remain open.
No foreign browser,new dependency,identity rotation or CAPTCHA bypass is used.
