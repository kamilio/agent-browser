# Website test inventory — September 12, 2026, eleventh update

**80 recorded attempted hosts, not 80 working websites.** The committed tenth
snapshot (`82b996d`) already includes both `libexpat.github.io` and
`fonts.googleapis.com`. The new sealed request/adapter accounting contains
only those two hosts. Google changes from a locally adapter-denied target to
one contacted HTTP200 stylesheet; **no unique host is added**.
`workingWebsiteCount` remains `null`. The full unchanged union and provenance
are in `reports/website-test-inventory-2026-09-12-eleventh-update.json`.

## Separate exact-stylesheet flow

**Native interaction flow: FAIL. Existing parent evidence checks: PASS.**
This is a separately predeclared session, not a retry, origin expansion within,
or reinterpretation of the original Expat same-origin contract.

Native UTC: **2026-09-12T10:00:08.385Z–10:00:09.526Z**. Supervisor UTC:
10:00:08.270Z–10:00:09.537Z, 1267 ms, exit 1, no timeout. The live runtime is
**12650 / 8b112c85d478279fef3913e66f013d5b25a8410f**, under the existing pinned
Node 22.22.0. The 12817 image-border runtime was not executed in this flow.

The only additional allowance is at most one original-homepage-loader
stylesheet GET to exactly
`https://fonts.googleapis.com/css?family=Roboto:300,400,500,700`.
Original native same-origin document/CSS/image loading otherwise remains the
contract. There is no changed query/path/family or identity, other Google URL,
gstatic/font-binary request, HTTP downgrade or unauthorized redirect. No
forced navigation, fallback action, retry, font substitution, source stripping,
capacity increase or bypass occurs.

## Exact response and interaction accounting

All six real bodyless GETs return HTTP200 with gzip content encoding.
Same-origin paths in the table are relative to `https://libexpat.github.io`.

| Requested resource | HTTP | Encoded body bytes | Content-decoded body bytes |
| --- | --- | --- | --- |
| `/` | 200 | 1656 | 5774 |
| `/3rdparty/bootstrap/3.0.0/css/bootstrap.min.css` | 200 | 16376 | 97339 |
| `/3rdparty/bootswatch/paper/bootstrap.min.css` | 200 | 23154 | 144416 |
| Exact Google stylesheet | 200 | 246 | 948 |
| `/theme/css/main.css` | 200 | 1098 | 3547 |
| `/theme/css/solarized-light.css` | 200 | 1078 | 3924 |
| Total | — | **43608** | **255948** |

Libexpat accounts for five GETs and **43362 encoded / 255000 content-decoded
bytes**. Google accounts for one GET and **246 / 948 bytes**. Native
request-start observations, adapter entries, admissions, transport requests,
wire constructions and replies are each six. Adapter rejections, redirects
and mocks are zero. Wire counters are native instrumentation, not packet
capture. These HTTP decoded-body bytes are not decoded image pixels or proof
of font-face installation.

The Google response is a stylesheet, **not a font binary**. CSS200 establishes
admission/contact/retrieval, not full font rendering, installed faces or a
working website. Native font support and dependencies are unchanged. The
predeclared request, transfer and wall limits remain 32 GETs, 2 MiB per response,
8 MiB encoded and decoded per session, 250 ms per-origin pacing, and 45 seconds
plus 5-second kill grace.

There is **one direct navigation, one committed homepage and one genuine
current-DOM click**. The browser inspects 26 anchors, identifies 10 eligible
occurrences and deduplicates nine destinations before selecting `e88`,
“Documentation”, at `https://libexpat.github.io/doc/`. The sole click fails at
`native-documentation-link-click` with `AgentBrowserError` / `unsupported`:

> Document width resolution requires an issue-free supported formatting profile

The failure occurs before destination navigation. Before and after the click,
the URL remains `https://libexpat.github.io/`, the title remains
“Welcome to Expat! · Expat XML parser”, and the document remains `e1`, with
297 nodes and revision 302. History stays at index 0 with one entry; request
count stays six. No destination document is captured. This is a native
interaction failure, not the old Google admission denial, HTTP restriction,
CAPTCHA/challenge or font-decoder diagnosis.

## Bounded diagnostics, not a sole cause

One readonly census after the failure visits 256 DOM nodes and records 308
formatting nodes. Revision remains 302. There are **13 non-CSS float-layout
guards, zero deferred nodes and zero deferred samples**. The census visit
count is not the committed document's 297-node total.

| CSS diagnostic category | Raw | Applicable |
| --- | --- | --- |
| Unimplemented or invalid value | 157 | 55 |
| Unimplemented property | 1412 | 668 |
| Unimplemented at-rule | 17 | 15 |
| Unimplemented or invalid selector | 599 | 599 |
| Unimplemented or invalid media query | 8 | 8 |

Raw CSS comes from `styles.metrics().issues`; applicable CSS comes from
`styles.metrics().applicableIssues`. Formatting CSS, non-CSS guards and
non-advisory subsets remain separately recorded in the JSON. These multiple
observations are not reduced to a guessed single cause; zero deferred nodes
is not a successful supported-layout result. No guard is suppressed and no
source or CSS rule is stripped.

## Original boundaries and separate code evidence

The original Expat flow remains failed at
**2026-09-12T09:50:12.059Z–09:50:12.768Z**: four adapter entries, three admitted
same-origin HTTP200 GETs, one local Google rejection, **41186 encoded / 247529
content-decoded bytes**, zero document commits and zero clicks. Its
`initial-navigation:network` / `ERR_ASSERTION` failure and uncontacted Google
status apply to that original session. They are not rewritten by the separate
new contract. Original report: `EXPAT-DOCUMENTATION-FLOW.md`; original final
seal remains `67230b973cd3a55ac0418cc957484db2335c4a62b38af746022ce040416c7853`.

The latest isolated code gate remains **12817 /
3890c339b2bba7c743c1322a36c733a8f2c2fc75**, with zero failed tests, two unchanged
exclusions, 247 suites, 246 strict roots, 641 manifest entries, 1140 source files,
1956 compiled files and seven committed snapshot inputs. Both live Expat flows
use the older 12650 snapshot; the later font-stylesheet flow is not relabeled
just because the newer gate was already available. No gate is rerun here.

The passing standards-mode **216 × 8** badge probe remains source-only:
zero HTTP requests, image fetches, page sessions and clicks, with mixed-content
policy intact and the original quirks variant still failing. The two earlier
failed source probes remain failed. None becomes a fresh website pass.

Libpng's earlier run still has zero adapter admission rejections **and one
image-owner mixed-content denial before any SourceForge request**. Its 23
HTTP200 responses and 345538 encoded / 366824 content-decoded transport bytes
remain unchanged; 2046524 image-owner pixel bytes are a different metric.
SourceForge was not contacted and adds no host or server/reachability/codec
judgment. The failed FAQ click, original Libarchive admission failure,
separate S3 HTTP403 contact and Netlib bounded success all retain their
historical paths, measurements and seals. No outcome becomes whole-site parity.

## Provenance and remaining gates

The parent independently compares **11 actual Git inputs (200747 bytes)** and
records **36 readonly checks**, flow false, with an unchanged final ledger.
Checks are timestamped **2026-09-12T10:01:31.791Z**; the parent interval is
10:01:31.548Z–10:01:31.800Z, exit 0. The task's 10:01:31.800Z is the parent
finish time, not another live run. Proof:
`node_modules/.cache/native-validation/image-border-work-september12/parent-expat-font-verification/SUMMARY.json`
and `stdout.txt`; matching verifier:
`node_modules/.cache/native-validation/image-border-work-september12/verify-expat-font.mjs`.
The proof and verifier are read, not reexecuted.

Flow sources are `EXPAT-FONT-STYLESHEET-FLOW.md` and the sealed
`RESULT.json`, `REPORT-CLAIMS.json` and receipt ledgers under
`node_modules/.cache/native-validation/native-expat-font-flow-september12/`.
Primary/final ledgers contain **223/225 entries**. The stable final SHA256 is
`022d6990af42f33aea2f1703988bb1fd77dfe45d8f52220d0c931876779cbce7`.

The new JSON records **65 distinct provenance input paths with SHA256s**,
including the committed tenth snapshot, current parent proof and sealed flow,
and unchanged historical/code/source-probe inputs. Only the two new
eleventh-update files are written. Local static evidence checks are not a
rerun: no network, browser, tests/builds, verifier/probe execution, credentials,
providers, devices, TTY/realSafeJS or protected payload reads; no shared
TASKS/source edits, staging or commits. Broader research, performance,
compatibility and challenge/handoff acceptance gates remain open.
