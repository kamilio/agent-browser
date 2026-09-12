# Website test inventory — September 12, 2026, twelfth update

**81 recorded attempted hosts, not 81 working websites.** Only
`www.pcre.org` is added to the immutable eleventh snapshot's 80-host union.
Bare `pcre.org` was allowed but never attempted. Historical adapter-denied
targets remain in the union; links merely inspected, replay mocks and the
pre-request SourceForge image-owner denial add no hosts.
`workingWebsiteCount` remains `null`. The JSON contains all 81 hosts.

Inventory UTC: **2026-09-12T11:01:03.236Z**; input hashes checked again at
**2026-09-12T11:01:03.241Z**. Previous snapshot commit:
`49490d7cdd49c7a4030e4c98a2e18c2ec6aa1d95` (`49490d7`). Its JSON SHA256 is
`95b7187f1a28e7de704d025029aa95c2041800455dbd2e47d72307759214b930`; its Markdown SHA256 is
`3836f4846c40c43c16c0a2ce8f6627ee8101707f03e29030d63922427dbca924`. Both match actual local
committed blob bytes; historical sources and measurements are not rewritten.

## New live evidence: PCRE

- **Native interaction flow FAIL; existing parent evidence checks PASS (36).**
  Native UTC 2026-09-12T10:49:35.976Z–2026-09-12T10:49:36.393Z; supervisor
  2026-09-12T10:49:35.857Z–2026-09-12T10:49:36.402Z, 545 ms,
  exit 1, no timeout, process group absent. Runtime **13042 / 9654150**,
  pinned Node 22.22.0; no new execution occurs during this inventory.
- Two original-loader bodyless GETs return HTTP200 with Brotli encoding:
  homepage **2686 encoded / 7949 decoded bytes**, `/style.css`
  **219 / 630**, total **2905 / 8579**. Adapter entries, admissions, native
  request starts, transport requests, wire constructions and responses are
  each two; rejections, redirects and mocks are zero. Only `www.pcre.org`
  is contacted. Wire counters are native instrumentation, not packet capture.
- One direct navigation commits one homepage. **43 anchors inspected**, two
  eligible occurrences and two destinations; one genuine current-DOM click on
  `e173`, “PCRE2 HTML documentation”, targeting `/current/doc/html/`, fails
  before destination navigation with `unsupported`:
  “Document width resolution requires an issue-free supported formatting profile”.
  Homepage/root `e1`, title “PCRE - Perl Compatible Regular Expressions”,
  262 nodes, revision 263 and history index 0/length 1 remain unchanged.
  No destination request or document is claimed.
- The single readonly census records six raw unimplemented-property CSS issues,
  two applicable and two formatting CSS issues, zero non-CSS guards and zero
  deferred nodes; 247 visited DOM nodes and 282 formatting nodes are different
  metrics from the committed document's 262 nodes. This is bounded diagnosis,
  not a sole cause or proof of supported layout.
- Existing predeclared limits stay 32 GETs, concurrency one, 250 ms pacing,
  2 MiB per response, 8 MiB session transfer, 45 s plus 5 s grace; original
  loader, native security and capacities remain. No retry, denial, forced
  destination, fallback, source stripping, identity change or bypass occurred.
  Sampled cleanup proves only instrumented owners, not long-duration retention.
- Parent proof ends **2026-09-12T10:52:52.616Z** after ten actual Git input
  comparisons and 36 readonly checks; this is evidence verification, not a
  second live visit. PCRE final seal (216 entries):
  `fa3ea2fe13e99b6f67aa298f3535300c1069a7e16df528d0dbe87705e9cfbed1`.
  Original preparation TypeError before launch and report-check adaptation typo
  (1044 versus 1144) remain recorded with original failures; corrected offline
  checks did not rerun the browser or alter its executed harness.

Sources: `PCRE-DOCUMENTATION-FLOW.md`, sealed `RESULT.json`,
`REPORT-CLAIMS.json`, `stdout.jsonl` and `FINAL-RECEIPTS.sha256` in
`node_modules/.cache/native-validation/native-pcre-flow-september12/`; existing parent
`node_modules/.cache/native-validation/quirks-image-work-september12/parent-pcre-verification/`.

## Separate isolated code gate

**13042 passed, zero failed, two unchanged exclusions** on commit
`96541506e7878af0bea70ed002bf13111765da3c`, at
2026-09-12T10:35:50.485Z–2026-09-12T10:38:30.544Z. Existing build, strict compilation,
formatter and native receipts pass: **250 suites, 249 strict roots, 644 manifest
entries, 1144 source files, 1960 compiled files, 1134 unchanged tracked inputs,
ten committed snapshot inputs**. There are **225 new cases** (154 helper,
70 document-layout, one canonical), with **759 focused passes across 17 suites**.

The corrected focus-aware canonical fixture fails on old 12817 and passes on
13042. Earlier 697/11 and 757/2 candidate results, baseline failures and the
round00 strict-cast failure remain preserved. This inventory inspects existing
receipts, not tests/builds or full source payloads. Native pass is **not**
website/device/provider/passkey/TTY/realSafeJS or performance acceptance.
Sources: `QUIRKS-IMAGE-ALTERNATIVES.md`, `node_modules/.cache/native-validation/quirks-image-work-september12/RELEASE.md` and
`node_modules/.cache/native-validation/native-quirks-image-september12-round01/` audit, commit verification and result receipts.

## Offline captured Libpng comparison

- **Not new live evidence or a site pass.** Existing 12817 baseline observation:
  2026-09-12T10:23:27.024Z–2026-09-12T10:23:32.682Z; 13042 observation:
  2026-09-12T10:44:50.952Z–2026-09-12T10:44:56.625Z. Each records one native
  homepage commit, one genuine FAQ click, **23 mocks, zero wire requests and
  zero new attempted hosts**. Each FAQ click remains unsupported before
  destination navigation; supervisor exit 0 means observation completion only.
- Same captured HTML/resources, DOM, state and discovery: guards **58 → 57**,
  deferred subtrees **9 → 8**. The badge changes from deferred to replaced
  `imageAlternative`; source, broken/policy-denied owner, natural dimensions
  zero and undecoded status are unchanged. SourceForge is not requested.
  **432 × 16 intrinsic text metadata** and declared **80px / 15px** dimensions
  are not measured whole-page used geometry, and no raster/geometry fallback
  or sole-cause claim is made.
- Remaining census: 31 HTML-presentation, 16 table-presentation, eight display
  markers and two inline-vertical-align occurrences. Table display markers
  have coordinator handling; **eight deferred markers do not prove eight
  missing table algorithms**, an exact hint-to-guard mapping or a sufficient
  table-only fix. No new source investigation or pending hint census is claimed.
- Parent baseline verification ends 10:34:34.653Z: ten Git objects/seven
  snapshot inputs, six evidence/eight replay groups. Parent current verification
  ends **2026-09-12T10:50:57.293Z**: 13 Git objects/ten snapshot inputs,
  **16 groups (7 evidence + 9 replay)**. Current final seal (231 entries):
  `a2e1d9686d3830764e18fdfa6901dd719b03a02673a0a1fa6d5ba871269e01a7`.
  Baseline seal (219 entries):
  `578fc1c557e86ca89105da71eee7032331925d9a11ea9923159905e99e303f46`.
  Its original query-redaction finalizer failure at 10:28:57.442Z and 1831-byte
  stderr remain intact; neither browser is rerun for inventory integration.

Sources: `LIBPNG-BORDER-BASELINE-REPLAY.md`, `LIBPNG-QUIRKS-REPLAY.md`,
`LIBPNG-QUIRKS-COMPARISON.md` (parent commit `202805e`, coordinator caveat),
their sealed observations/comparison, and existing
`node_modules/.cache/native-validation/quirks-image-work-september12/parent-baseline-replay-verification/` and
`node_modules/.cache/native-validation/quirks-image-work-september12/parent-quirks-replay-verification/` proofs.

## Retained qualifications and provenance

The original Expat Google admission denial and later separately authorized
exact-stylesheet HTTP200 contact remain distinct, both on **12650**; retrieval
is not font-binary loading, face installation or rendering acceptance. Its
later Documentation click still fails. Libarchive/S3 boundaries and Netlib's
bounded success keep their original paths, measurements and seals; none means
whole-site parity. Earlier failed source probes and the **216 × 8** standards-mode
source-only badge result remain historical, with zero HTTP/sessions/clicks and
the original quirks failure. They are not full-page captured or live passes.

Original live Libpng retains zero adapter rejections **and one image-owner
mixed-content denial before any SourceForge request**; 23 HTTP200 responses,
345538 encoded / 366824 decoded transport bytes and 2046524 image-owner pixel
bytes remain distinct original metrics, not fresh replay wire traffic.

The JSON records **56 directly consumed input paths**, exact byte counts,
SHA256s, available independent pins and a final stable rehash; inherited
provenance stays explicitly transitive, not newly reread or reverified.
Only the two named twelfth-update deliverables and a private helper are written.
No TASKS/source/historical edits, staging, commits, network, browsers,
tests/builds, verifier reruns, credentials/providers/devices/TTY/realSafeJS or
protected payload access. Parent integration remains separate. Broader website,
compatibility, research/performance and device/challenge gates remain open.
