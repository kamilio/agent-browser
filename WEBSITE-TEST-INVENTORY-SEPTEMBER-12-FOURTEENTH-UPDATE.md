# Website test inventory — September 12, 2026, fourteenth update

**83 recorded attempted hosts, not 83 working websites.** Add only
`www.vim.org` to the immutable thirteenth snapshot's 82-host union.
`workingWebsiteCount` remains `null`; the JSON lists all 83 hosts.
The new `www.kuwasha.net` image admission entry is rejected before its
native transport, DNS or wire access and is **excluded** under the retained
rule. Previously recorded historical adapter-denied targets remain unchanged;
they are not generalized into a rule counting every new pre-transport target.

Audit UTC: **2026-09-12T12:16:28.555Z**; final input rehash:
**2026-09-12T12:16:28.568Z**. Previous snapshot commit:
`ecbaa93736532f1ec70a3f572b43bf58180e4603` (`ecbaa93`). Previous JSON SHA256:
`b42ea9d62b9b7e88950c016dd1b8762745cb154631857fb9ddd3c81c18779d40`;
previous Markdown SHA256:
`1e479e4df72e6df0186e70cf3dd76f55761da97b3132fecf887f0d4e6b646b88`.
Both match actual committed local blobs. All **170 distinct inherited consumed
inputs / 183 stored digest claims** were independently rehashed without mismatch.

## New live evidence: Vim

- **Flow FAIL; parent evidence verification PASS (12 groups).** Native UTC
  **2026-09-12T12:04:19.388Z–2026-09-12T12:04:22.079Z**; supervisor
  **2026-09-12T12:04:19.049Z–2026-09-12T12:04:22.096Z**, 3.045907 seconds,
  exit 1, final process group absent. Runtime **13226 / fa49059**, pinned
  Node 22.22.0. This inventory does not repeat that execution.
- Seven original-loader bodyless GETs return HTTP200: one HTML document,
  one stylesheet and five images. Total **96397 encoded / 113897 decoded
  body bytes**. There are **8 adapter entries/request starts**, **7 admissions,
  transport requests and wire constructions/responses**, **1 local rejection**,
  zero redirects and zero mocks. Wire counts are native instrumentation,
  not packet capture or total header/TLS traffic.
- Entry eight targets the Kuwasha SVG image. The exact first stop is
  `initial-navigation:network` / `ERR_ASSERTION`: “Harness admission
  boundary: requests require native document or original-loader public HTTPS
  CSS/image provenance”. **Zero document commits, inspected anchors and clicks**;
  no link was selected. Committed URL/title/history/document/body and destination
  state are unavailable, not inferred from the requested homepage URL.
- This is the predeclared same-origin harness boundary, **not native width
  failure, server restriction, crash or a decoder/reachability judgment**.
  No retry, extra origin, forced navigation, source stripping or capacity increase.
  Original native security and 32-GET, 250 ms pacing, one-concurrent,
  2 MiB response/8 MiB session, 45 s plus 5 s grace limits remain.
- The retained partial-document census records **122 non-CSS occurrences**,
  **59 deferred subtrees** (up to 20 samples), 893 visited DOM nodes and 732
  formatting nodes. Raw CSS: 26 invalid-value / 12 property issues; applicable
  and formatting: 10 / 2. Its generic “after layout failure” scope string does
  not change the actual earlier admission failure. Partial diagnostics are not
  committed state, pixels, used geometry or proof of a future click guard.
  Table display markers have coordinator handling, not missing-algorithm counts.

Parent verification finishes **2026-09-12T12:07:45.296Z**: **11 actual Git
objects, 8 snapshot inputs, 6 evidence + 6 flow groups**, final **153-entry** seal:
`709719e940a576e0dc586acfbb7a5dd4b8fe428cf9fb1933087986880fbf5830`.
The pre-Git/native/network scaffolding substitution failure remains documented;
it did not launch another browser. Sources: `VIM-DOCUMENTATION-FLOW.md`,
`node_modules/.cache/native-validation/native-vim-flow-september12/`, and existing
`node_modules/.cache/native-validation/html-background-color-work-september12/parent-vim-verification/` proof.

## Separate isolated 13226 gate

`HTML-BACKGROUND-COLOR.md`, commit
`fa49059b123243f1b220a8b198607a62c5dc4927`: **13226 passed, zero failed,
two unchanged exclusions**; **253 suites, 252 strict roots, 647 manifest entries,
1148 source files, 1964 compiled files, 1140 unchanged tracked inputs and
8 committed snapshot inputs**. Gate UTC:
**2026-09-12T11:39:05.200Z–2026-09-12T11:41:48.275Z**.
Existing build/strict/formatter/native receipts pass; no tests are run here.
There are **184 new cases / 891 focused passes across 18 suites**.

Legacy bgcolor hints and collapsed-table spanning-cell paint order are separate
code evidence, not full table/marquee or website acceptance. Original baseline
0/1, initial 883/6, expanded baseline 1/2 and final 891/0 iterations remain;
five fixture-oracle failures and the genuine collapsed paint defect are not
reclassified. Immutable gate: `node_modules/.cache/native-validation/native-html-background-color-september12-round00/`.
Older PCRE, Tukaani, Netlib repeat and source-only reports retain **13042**.

## Captured Libpng follow-up

`LIBPNG-BACKGROUND-COLOR-REPLAY.md` (`c26c8d9`) records completed
offline 13226 observations at **2026-09-12T11:54:48.647Z–2026-09-12T11:54:54.343Z**.
Diagnostics change **57 → 49**, deferred stays **8 → 8**; the remaining count
is **41 hard guards plus 8 table coordinator markers**. Eight original row
colors become computed paint RGBA, **not sampled pixels or whole-page geometry**.
The FAQ click still fails native width before destination navigation.
Each replay has **23 mocks, zero real HTTP/wire and zero new hosts**.
Badge source/security remains broken, policy-denied, natural0 and undecoded;
SourceForge is not requested. No sole-cause or table-algorithm-completion claim.

Parent verification ends **2026-09-12T11:56:10.946Z**, 18 readonly groups,
11 Git objects/8 snapshot inputs. Final **228-entry** seal:
`b27d3569e2ef837ce235901519391a36cf4055971cddd77a8e17365e71ea5257`.
Earlier live capture, 12817 and 13042 replay paths/measurements remain intact.

## Separate primitive performance evidence

`LAYOUT-PAINT-ORDER-PERFORMANCE.md` (`de0ddc3`) completes **one BA
process, not the planned counterbalanced AB/BA pair**. The first AB process
fails before timing on a table-marker fixture oracle; the amended final BA
process runs at **2026-09-12T11:55:13.936Z–2026-09-12T11:55:14.905Z**.
All **54 samples / 16200 measured iterations** are retained; both process
allowances are consumed, with no replacement AB or sample removal.

| Primitive profile | Old median µs | New median µs | Observed change |
| --- | ---: | ---: | ---: |
| Ordinary blocks | 21.078 | 21.768 | +3.3% |
| Separate-border table | 47.312 | 52.302 | +10.5% |
| Collapsed rowspan table | 49.574 | 47.218 | -4.8% |

Slower noncollapsed cases remain visible. Fixed BA order, overlapping ranges
and absent CPU/GC/JIT isolation or significance testing prohibit established
speedup/regression or **whole-browser speed** claims. Ordering/charge equality
does not prove zero extra CPU cost. Original failed setup, sealing syntax
failure, report and seal are preserved separately from the clarified report.

Parent proof ends **2026-09-12T12:05:48.497Z**. Actual Git comparison (18
inputs, old10/new8) occurs outside the seal; socket-denied artifact/sample
verification uses retained proof, not new Git or benchmark execution.
Follow-up verification seal:
`830574e117621bb7e42c746983cd291098296c797ca56106547030025b850808`.

## Existing hosts and provenance

- The WHATWG microsyntax/rendering **two-GET native source retrieval** uses
  already-counted `html.spec.whatwg.org`: HTTP200, **74440 encoded / 487849
  decoded bytes**, zero BrowserSessions and **zero new hosts**. It is source
  research, not a website interaction pass or new gate.
- Completed `NETLIB-QUIRKS-FLOW.md` remains **13042**, at
  **2026-09-12T11:10:36.349Z–2026-09-12T11:10:37.263Z**: four HTTP200 GETs,
  **34762 encoded/decoded bytes**, two commits and one genuinely discovered FAQ
  click; 37 readonly checks. Existing `www.netlib.org` adds **zero hosts**.
  This bounded successful flow is not whole-site parity and does not consume
  the pending 13226 Netlib flow or pending cellpadding research.
- PCRE source-only attribution and preserved run failures, original Expat/Google
  CSS-only contact, Libarchive/S3 boundaries, earlier Netlib and Libpng outcomes
  retain original runtimes, paths and seals. Image-owner denial, adapter denial,
  transport bytes and decoded pixel bytes remain distinct. No history becomes
  a new live pass; working-site count remains unknown.

The JSON pins **259 consumed input hashes**, including the independently
reverified inherited inputs, with exact bytes, audit UTC and final stable
rehashes. Only the two new fourteenth files and a private helper are written.
No shared TASKS/source/manifest/historical edits, staging/commits/push,
network/native/test/build/replay/benchmark/verifier runs, credentials/providers/
devices/TTY/realSafeJS or protected payload access. Parent integration and all
broader website/rendering/research/performance/device/challenge gates remain
separate.
