# Website test inventory — September 12, 2026, ninth update

**78 recorded attempted hosts, not 78 working websites.** The eighth-update
host union is unchanged; `workingWebsiteCount` remains `null`. The full list
and digest-linked provenance are in
`reports/website-test-inventory-2026-09-12-ninth-update.json`.

`s3.amazonaws.com` was already a historically recorded, locally adapter-denied
subresource target. It now has one native wire request and an HTTP403 reply;
this changes contact status, not the unique-host count. Historical denied-only
entries such as `c.statcounter.com` are not promoted to contacted websites.
The pre-request SourceForge image-owner denial adds no host.

## Separately authorized Libarchive public-asset flow

**Bounded flow: FAIL. Existing parent evidence verification: PASS.** These
are different claims. This inventory does not perform another website run.

Native UTC: **2026-09-12T09:24:22.288Z–09:24:22.671Z**. The supervisor ran
09:24:22.171Z–09:24:22.680Z (509 ms, exit 1, no timeout). The pinned release is
**12650 / 8b112c85d478279fef3913e66f013d5b25a8410f**, not the earlier Libpng
12470 runtime. The separately predeclared contract permits at most one
original-loader GET of this exact previously observed public image:
`https://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png`.
It does not permit other S3 URLs, altered queries, off-origin redirects,
retries or bypasses.

| Original native request | HTTP | Encoded body bytes | Content-decoded body bytes |
| --- | --- | --- | --- |
| `https://www.libarchive.org/` | 200 | 6635 | 6635 |
| `https://www.libarchive.org/style.css` | 200 | 690 | 690 |
| Exact S3 ribbon image | 403 | 263 | 263 |
| Total | — | 7588 | 7588 |

All three responses use identity content encoding. The image request receives
a 263-byte XML error response, not a successfully decoded image. There are
three adapter entries, three admissions, three native transport requests,
three wire requests and three replies; zero adapter rejections, redirects,
mocks or retries. Libarchive accounts for 7325 encoded/decoded bytes and S3
for 263. Wire counters are native instrumentation, not packet capture.

The first failure is `initial-navigation:response-policy`:
`HTTP failure or classified access barrier`. The observed restriction is the
asset HTTP403; no challenge was classified. There is one direct navigation
attempt but **zero document commits, zero inspected anchors and zero clicks**.
The initial committed state, discovery and destination are null. HTML/CSS200
does not mean a document committed before the asset failure. Admission
succeeded; image retrieval, rendered-page acceptance and destination acceptance
did not. No codec or native-layout repair is demonstrated.

The single readonly census examines the retained partial DOM after the HTTP403
abort. Its inherited “after layout failure” label is not the actual first
failure here. Raw CSS has one unsupported/invalid value and three unsupported
properties; applicable CSS has one such value and two properties. Independent
non-CSS findings are one positioned-layout coordination guard and one
unsupported-element guard, with one deferred image. No sole cause, source
stripping, guard suppression or partial-rendering fallback is claimed.

## Historical boundary stays failed

The original single-origin Libarchive run remains unchanged at
**2026-09-12T08:42:36.618Z–08:42:36.964Z**. It received HTML/CSS200 and
7325 encoded/decoded bytes, but denied the S3 image at adapter admission:
three adapter entries, two admissions/wire requests/replies, one rejection,
zero document commits and zero clicks. Its failure remains
`initial-navigation:network` / `AssertionError` / `ERR_ASSERTION`, with the
original harness-admission message retained in the JSON.

The later exact-asset flow is a new authorized contract, not a retry within
that original contract or a retrospective pass. The original report and seal
remain at `LIBARCHIVE-DOCUMENTATION-FLOW.md` and its existing private lane.
Netlib's earlier bounded one-click success is also unchanged, not whole-site
parity or a newly executed result.

## Libpng qualification, not rewritten evidence

The **2026-09-12T08:56:00.180Z–08:56:06.428Z** Libpng run remains on
12470 / e8375acfaeb460cea9a7dc4b35d5c1e45ae3fda3. It has 23 HTTP200 responses,
345538 encoded and 366824 content-decoded transport bytes, one committed
homepage and one failed FAQ click at native width resolution. It has **zero
adapter admission rejections**, but that is not zero local policy denials.

The captured image-owner state for `e344` records a broken, complete image
with `error: policy-denied`, zero natural dimensions and the redacted URL
`http://sflogo.sourceforge.net/sflogo.php?redacted`. The native image owner
blocks that HTTP badge as mixed content under the HTTPS document **before any
fetch callback, adapter request or wire request**. The historical empty
adapter/local-rejection arrays do not cover this owner-level denial.

SourceForge was not contacted, supplies no response and adds no host. This is
not evidence about its server, reachability or an image codec. The image-owner
2046524 decoded pixel bytes are separate from the 366824 content-decoded HTTP
bytes. The eighth inventory's broad “no denial” wording is qualified here;
its original text, Libpng report, captured states and seals are not edited.

## Source probes are not live passes

The existing synthetic quirks probes remain failed evidence: run00 at
**2026-09-12T09:30:50.457Z–09:30:50.567Z** and run01 at
**2026-09-12T09:32:25.192Z–09:32:25.304Z**, both exit 1. Run00 has empty stdout;
run01 prints observations before failing the positive-width no-quirks-control
assertion. Printed JSON is not a successful probe exit.

Run01 records zero HTTP requests, image-fetch calls, page sessions and clicks.
Both doctype variants retain the policy-denied badge and a presentation-hint
guard; the quirks sample additionally has an unsupported-element guard. Both
geometry observations fail. These source-derived synthetic documents do not
prove a doctype fix, a sole cause, a full Libpng replay or a live website pass.
Their exact summaries, stdout, stderr and captured probe sources are referenced
in the new JSON; no probe is rerun for this inventory.

## Provenance and outstanding gates

The parent independently compared **11 actual Git inputs** and recorded
**35 readonly evidence checks** at **2026-09-12T09:30:50.319Z** (parent interval
09:30:50.083Z–09:30:50.330Z, exit 0). Source:
`node_modules/.cache/native-validation/post-list-style-work-september12/parent-libarchive-public-asset-verification/SUMMARY.json`
and its `stdout.txt`, with the matching
`node_modules/.cache/native-validation/post-list-style-work-september12/verify-libarchive-public-asset.mjs`.
The verifier was read, not executed by this inventory worker.

The sealed `RESULT.json` and `REPORT-CLAIMS.json` are under
`node_modules/.cache/native-validation/native-libarchive-public-asset-flow-september12/`;
report: `LIBARCHIVE-PUBLIC-ASSET-FLOW.md`. Primary/final ledgers contain
198/200 entries. The unchanged final-ledger SHA256 is
`d3f655b07b3340a91ec592d26cd96dee71fbff71b523e647f97dd4b18a67bfb0`.
The new JSON records the previous snapshot digest, report/result/claims hashes,
parent proof hashes and local correction/probe provenance.

The existing 12650 native passes, zero failures, two unchanged exclusions,
244 selected suites, 243 strict roots and 638 manifest entries remain an
isolated code gate, not live acceptance. No test, build, browser, network,
credential or protected payload access is performed for this update. Only the
two new inventory files are written: no historical report, source, TASKS,
staging or commit changes. Provider/passkey/device/TTY/realSafeJS, broader
research, performance, compatibility and challenge/handoff goals remain open.
