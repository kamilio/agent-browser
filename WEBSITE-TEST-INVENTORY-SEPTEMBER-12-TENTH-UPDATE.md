# Website test inventory — September 12, 2026, tenth update

**80 recorded attempted hosts, not 80 working websites.** The committed ninth
snapshot (`ec98fac`) contains 78 hosts. This update adds
`libexpat.github.io`, actually contacted, and `fonts.googleapis.com`, locally
adapter-denied before transport. The second addition follows the existing
historical denied-target counting rule; it is not a claim of Google wire
contact. `workingWebsiteCount` remains `null`. The complete host union and
provenance are in `reports/website-test-inventory-2026-09-12-tenth-update.json`.

## Original same-origin Expat flow

**Bounded flow: FAIL. Existing parent evidence verification: PASS.** Only the
original same-origin Expat contract is integrated here. Any separate Expat
font-asset contract, including pending or new results, is excluded.

Native UTC: **2026-09-12T09:50:12.059Z–09:50:12.768Z**. Supervisor UTC:
09:50:11.941Z–09:50:12.781Z, 840 ms, exit 1, no timeout. The live runtime is
**12650 / 8b112c85d478279fef3913e66f013d5b25a8410f**, not the newer image-border
release. The historical release has 1136 source files, 1952 compiled files,
244 suites, 243 strict roots and 638 manifest entries; it was not rerun here.

All three bodyless wire GETs go to `https://libexpat.github.io`:

| Path | HTTP | Content encoding | Encoded body bytes | Content-decoded body bytes |
| --- | --- | --- | --- | --- |
| `/` | 200 | gzip | 1656 | 5774 |
| `/3rdparty/bootstrap/3.0.0/css/bootstrap.min.css` | 200 | gzip | 16376 | 97339 |
| `/3rdparty/bootswatch/paper/bootstrap.min.css` | 200 | gzip | 23154 | 144416 |
| Total | — | — | 41186 | 247529 |

There are **four native request-start observations and four adapter entries**:
three admissions and one rejection. Transport requests, wire constructions
and replies are each three. Redirects and mocks are zero; there is no retry.
Encoded and content-decoded HTTP bytes are separate measurements, not decoded
image pixels. Wire evidence is native instrumentation, not packet capture.

The original stylesheet loader attempts
`https://fonts.googleapis.com/css?family=Roboto:300,400,500,700`. The unchanged
same-origin adapter boundary rejects it **before native transport**: one
adapter entry, zero admissions, zero wire requests/replies, no HTTP status and
zero encoded/decoded bytes for Google. The first failure remains
`initial-navigation:network` / `AssertionError` / `ERR_ASSERTION`:

> Harness admission boundary: requests require native document or original-loader public HTTPS CSS/image provenance

This is a local admission failure, not a Google server response, CAPTCHA,
challenge, reachability result, codec failure or layout verdict. No font-asset
allowance or inherited Libarchive S3 exception applies to this session.

There is **one direct navigation attempt, zero document commits, zero inspected
anchors and zero clicks**. Discovery was never reached, no link was selected,
and no committed initial title/history or destination document was captured.
The three HTTP200 responses do not imply a committed homepage or working flow.

The readonly census observes only the retained partial native document:
256 visited DOM nodes, 306 formatting nodes, revision 299 unchanged, and zero
deferred nodes/samples. Raw CSS and applicable CSS remain separate in the JSON;
14 non-CSS float-layout guards are independent diagnostics. The inherited
helper label “after layout failure” is not this run's first failure. No sole
cause, source repair, issue suppression or successful rendering is claimed.

The predeclared contract remains at most 32 bodyless GETs, 2 MiB per response,
8 MiB encoded and decoded session limits, 250 ms per-origin pacing, 45 seconds
plus 5-second kill grace, and at most one discovered same-origin documentation
click. There is no retry, forced destination, capacity increase or bypass.

## Newer code gate, separate from the live flow

The latest isolated gate is **12817 / 3890c339b2bba7c743c1322a36c733a8f2c2fc75**,
`native-image-border-september12-round01`. Its recorded interval is
**2026-09-12T09:48:10.449Z–09:50:47.980Z**, with audit at 09:51:03.648Z and
commit verification at 09:51:19.679Z. Thus Expat's live session finished before
this newer gate completed; its runtime must not be relabeled.

`HTML-IMAGE-BORDER.md`, the gate `AUDIT.json` and `COMMIT-VERIFICATION.json`
record **12817 passed, zero failed, two unchanged exclusions**, 247 selected
suites, 246 strict roots, 641 manifest entries, 1140 source files, 1956 compiled
files and seven actual committed snapshot inputs. Build/strict/formatter/native
success belongs to that existing gate, not a new execution for this inventory.

The repair covers legacy embedded-image border hints and standards-mode
broken-image alternatives. It does not remove mixed-content policy or repair
the original quirks fallback/full Libpng flow. Earlier canonical baseline and
fixture failures remain in the original evidence; no result is rewritten.

## Source-only badge result and preserved qualifications

The existing `badge-doctype-source-probe` runs on 12817/3890c33. Its supervisor
interval is **2026-09-12T09:51:19.767Z–09:51:19.884Z**, exit 0; observations are
09:51:19.852Z–09:51:19.875Z. The standards-mode control records **216 × 8**
geometry with no formatting issues. The original-doctype quirks variant still
fails width resolution with `element-layout-not-supported`.

Both synthetic variants retain a broken `policy-denied` HTTP SourceForge badge,
zero natural dimensions, zero image requests/resources/decoded pixel bytes,
and zero fetch calls. The probe records **zero HTTP requests, page sessions
and clicks**. This is source-only alternative-content geometry, not successful
image loading, a fresh website visit, a full Libpng replay or live acceptance.
The public badge attributes are preserved; the HTML5 control is not the live
page's original doctype. The probe is read here, not rerun.

The prior source probes remain failed: run00 at
**2026-09-12T09:30:50.457Z–09:30:50.567Z** and run01 at
**2026-09-12T09:32:25.192Z–09:32:25.304Z**, both exit 1. Their positive-width
no-quirks-control assertion failures are retained, not retrospectively passed.

Libpng's earlier 12470 run remains 23 HTTP200 responses, 345538 encoded and
366824 content-decoded bytes, one committed homepage and a failed FAQ click.
It had **zero adapter admission rejections but one image-owner mixed-content
policy denial** before any SourceForge request. The 2046524 image-owner decoded
pixel bytes are not the HTTP decoded-byte total. SourceForge was not contacted,
adds no host and supports no server, reachability or codec judgment. The ninth
update's correction and all historical evidence are preserved unchanged.

The original Libarchive single-origin failure, the separate S3 HTTP403 contact
and Netlib's bounded click success retain their original reports, paths,
measurements and seals. S3 stays in the host union with its ninth-update contact
qualification; it is not newly counted or allowed in Expat. No historical
success is expanded into whole-site parity.

## Provenance and remaining gates

The existing parent proof independently compares **11 actual Git inputs
(200747 bytes)** and records **35 readonly evidence checks**. Its check timestamp
is **2026-09-12T09:52:22.821Z**; the parent interval is
09:52:22.590Z–09:52:22.832Z, exit 0. The task's 09:52:22.832Z is the parent
finish time, not a second live run. Proof:
`node_modules/.cache/native-validation/image-border-work-september12/parent-expat-verification/SUMMARY.json`
and `stdout.txt`; matching verifier:
`node_modules/.cache/native-validation/image-border-work-september12/verify-expat.mjs`.

`EXPAT-DOCUMENTATION-FLOW.md` and the sealed `RESULT.json` / `REPORT-CLAIMS.json`
under `node_modules/.cache/native-validation/native-expat-flow-september12/`
are the flow sources. Primary/final ledgers contain **197/199 entries**. The
unchanged final-ledger SHA256 is
`67230b973cd3a55ac0418cc957484db2335c4a62b38af746022ce040416c7853`.
The new JSON links the committed ninth snapshot, exact input hashes, parent
proof, code gate, source probe and unchanged historical provenance.

This update performs local evidence inspection and static consistency checks
only. No network, browser, tests, builds, verifier/source-probe execution,
credentials, providers, devices, TTY/realSafeJS or protected payload reads.
Only the two new tenth-update files are written: no historical reports, shared
TASKS, staging or commits. Broader research, performance, compatibility,
provider/passkey/device and challenge/handoff acceptance gates remain open.
