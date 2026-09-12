# Website test inventory — September 12, 2026, thirteenth update

**82 recorded attempted hosts, not 82 working websites.** Only
`www.tukaani.org` is added to the committed twelfth snapshot's 81-host union.
Bare `tukaani.org` was allowed but never attempted. Historical adapter-denied
targets remain; inspected links, source-only PCRE attribution and captured
replays add no hosts. `workingWebsiteCount` remains `null`.
The companion JSON contains the complete 82-host union.

Inventory UTC: **2026-09-12T11:09:18.958Z**; all consumed inputs rehashed at
**2026-09-12T11:09:18.960Z**. Previous snapshot commit is
`7c0a634f45cddb48fa12e4e4042f2bf28d36d593` (`7c0a634`), not the independent PCRE source-check
commit `4c9c553`. Previous JSON SHA256:
`5970ed1fece4516de8c3b637c94547a81f06a041d942ec6a0b8a0d88dab5cab8`;
previous Markdown SHA256:
`2eeed44dea6e45c2351bd6cbb22aa181f4538037c1bdb3c294e4ba0b5c1e487a`.
Both match actual local committed blob bytes; history stays immutable.

## New live evidence: Tukaani

- **Native interaction flow FAIL; parent readonly evidence checks PASS (36).**
  Native UTC **2026-09-12T10:55:30.610Z–2026-09-12T10:55:31.655Z**; supervisor
  **2026-09-12T10:55:30.492Z–2026-09-12T10:55:31.665Z**,
  1173 ms, exit 1, no timeout, process group absent. Runtime **13042 / 9654150**,
  pinned Node 22.22.0; this inventory performs no new browser execution.
- Two original-loader bodyless GETs return HTTP200 with gzip encoding:
  homepage **1234 encoded / 3508 decoded bytes**, `/style.css`
  **8879 / 28886**, total **10113 / 32394**. Adapter entries/admissions,
  native request starts, transport requests, wire constructions/responses are
  each two; rejections, redirects and mocks are zero. Only `www.tukaani.org`
  is contacted. These wire counts are native instrumentation, not packet capture.
- One direct navigation commits one homepage. **14 anchors inspected**, five
  eligible occurrences and five unique destinations. The one genuine click
  selects current-DOM `e227`, **“Tukaani developers”**, original
  `about.html`, and fails native width resolution before requesting or
  committing the destination. Error: `unsupported`, “Document width resolution
  requires an issue-free supported formatting profile”. Homepage title
  “The Tukaani Project”, root `e1`, **249 nodes/revision 250**, URL and history
  index 0/length 1 remain unchanged. This is not a remote or admission denial.
- One readonly census records **232 visited DOM nodes / 332 formatting nodes**,
  one non-CSS `overflow-layout-not-supported` occurrence and **zero deferred
  nodes/samples**. CSS counts retain distinct raw and applicable provenance:

| CSS category | Raw | Applicable / formatting |
| --- | ---: | ---: |
| Unimplemented property | 120 | 43 |
| Unimplemented or invalid value | 31 | 6 |
| Unimplemented or invalid selector | 28 | 28 |
| Unimplemented at-rule | 1 | 1 |

Zero deferred nodes is not supported layout; these bounded diagnostics are
not a sole-cause attribution. No second interaction, partial-layout fallback,
source stripping, retry, identity change, capacity increase or bypass occurs.
Original 32-GET, one-concurrent, 250 ms pacing, 2 MiB response/8 MiB session,
45 s plus 5 s grace bounds and native loader/security remain unchanged.

Parent checks finish **2026-09-12T11:01:45.774Z**, after ten actual Git input
comparisons and 36 readonly checks. Final ledger: **206 entries**, SHA256
`b71ae043a44ecaa25ad3890248e478be2a6415601d51e85ab30a2207454f9a76`.
Evidence-check pass is not interaction or whole-site acceptance. Sources:
`TUKAANI-DOCUMENTATION-FLOW.md`, sealed observations/claims/receipts under
`node_modules/.cache/native-validation/native-tukaani-flow-september12/`, and
`node_modules/.cache/native-validation/quirks-image-work-september12/parent-tukaani-verification/` existing summary/stdout/stderr.

## New offline diagnostic: PCRE CSS

**Source check passes; no new live result or production code change.**
Source UTC **2026-09-12T10:59:23.046Z–2026-09-12T10:59:23.126Z**; supervisor
**2026-09-12T10:59:23.019Z–2026-09-12T10:59:23.135Z**, exit zero.
The unchanged captured HTML (**7949 bytes**) and linked CSS (**630 bytes**)
are parsed natively with scripting false, yielding **262 nodes/revision 263**.
There are **10 scanned source rules, 9 retained rules and 22 declarations**;
six raw unsupported-property occurrences and two applicable occurrences.

| Original selector | Unsupported declaration | Source matches |
| --- | --- | ---: |
| `a` | `text-decoration: underline` | 43 |
| `a` | `cursor: pointer` | 43 |
| `a:hover` | `text-decoration: underline` | 0 |
| `a.links` | `text-decoration: none` | 0 |
| `a.links:hover` | `text-decoration: none` | 0 |
| `button` | `cursor: pointer` | 0 |

The applicable count is **two declaration occurrences, not 86 failing
elements**. All six diagnostics remain recorded; `a.links:hover` contributes
no retained rule because its sole declaration is unsupported. Each selector
sample is capped at five refs. Zero hover matches describes this source-only
state, not live pointer state or future interaction. The whole original sheet
is parsed without repair or suppression; no geometry/raster fallback is used.
**Zero BrowserSessions, requests, mocks, clicks and new hosts.** No sole-cause,
installed-resource, complete-rendering or destination-success claim follows.

Preserved failures: run00 fails before probe launch because the original
repository-relative PCRE ledger used the lane base; its failure note is
explicitly retrospective, not captured contemporaneous stderr. Run01 exits
one at **2026-09-12T10:58:31.502Z**, empty stdout, with the incorrect
**10 versus 9** rule oracle. Run02 corrects diagnostic accounting, not the
production runtime or captured site. No failed evidence is rewritten.

Existing before/after proof verifies **20 release receipts, 1144 source files,
1960 compiled files and ten actual Git inputs**, with the original **216-entry
PCRE ledger** stable at
`fa3ea2fe13e99b6f67aa298f3535300c1069a7e16df528d0dbe87705e9cfbed1`.
Readonly verification at **2026-09-12T11:01:18.527Z** passes **27 evidence
entries** without recomputing the source check or rerunning the browser.
Source-evidence ledger SHA256:
`3b1c4dceda069072d2f83efe128d5a2ba12be19ede9a648ccca038f9d6634e06`.
Sources: `PCRE-CSS-SOURCE-CHECK.md` (commit `4c9c553`),
`node_modules/.cache/native-validation/quirks-image-work-september12/PCRE-CSS-SOURCE-VERIFICATION.json`,
`PCRE-CSS-SOURCE-RECEIPTS.sha256`, and retained run00/run01/run02 artifacts
in that work directory. Original live PCRE failure, timing, 2905/8579 transfer
bytes, selected click, 43 inspected anchors and seal remain exactly as recorded
in the twelfth snapshot; source attribution does not replace those facts.

## Unchanged gate and inherited qualifications

The latest recorded isolated native gate remains **13042 passed / zero failed /
two unchanged exclusions**, commit `96541506e7878af0bea70ed002bf13111765da3c`:
250 suites, 249 strict roots, 644 manifest entries, 1144 source/1960 compiled
files, 1134 unchanged tracked inputs and ten committed snapshot inputs.
The 225 new cases/759 focused passes and prior failing iterations retain their
existing evidence; no test/build is run here. Native pass is not website,
provider/passkey/device/TTY/realSafeJS or research/performance acceptance.

Libpng remains an offline captured **58 → 57 guards / 9 → 8 deferred** comparison:
23 mocks per run, zero wire/new hosts, FAQ unsupported, badge broken and
policy-denied with zero natural size/decoded pixels, no SourceForge request.
Intrinsic alternative metadata and declared dimensions are not whole-page used
geometry. Table markers have coordinator handling, not proof of eight missing
table algorithms or a sufficient table-only fix. No pending hint census is added.

Original Expat denial and separately allowed exact Google stylesheet contact
remain distinct on 12650; CSS200 proves neither font installation nor a working
flow. Libarchive/S3 boundaries, Netlib bounded success, earlier source-only badge
geometry and failed probes retain original paths, measurements and runtime labels.
Historical adapter denial versus image-owner denial and transport versus decoded
image-pixel bytes stay distinct. Nothing becomes whole-site parity.

The JSON records **62 directly consumed inputs** with exact bytes,
SHA256s, available independent pins and final stable rehashes. All 27 PCRE
source-evidence entries are hashed; their helpers are never executed. Inherited
provenance remains transitive unless explicitly read in this update. Only the
two new thirteenth files and a fresh private helper are written; no TASKS,
source, manifest or historical edits, staging/commits/push, network/browser,
tests/builds/verifier reruns, credentials/providers/devices/TTY/realSafeJS or
protected payload access. Parent integration and broader acceptance gates
remain separate.
