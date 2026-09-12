# Website test inventory — September 12, 2026, fifteenth update

**84 recorded attempted hosts, not 84 working websites.** Only
`libjpeg-turbo.org` is added to the committed fourteenth 83-host union.
`www.libjpeg-turbo.org` was allowed-only, never attempted; existing Netlib/
WHATWG, source research and captured replay add no hosts. Historical adapter
targets and earlier Kuwasha/SourceForge exclusions are not reclassified.
`workingWebsiteCount` remains `null`; the JSON lists all 84 hosts.

Audit UTC: **2026-09-12T13:00:58.234Z**; final artifact rehash:
**2026-09-12T13:00:58.256Z** (one checksum-only exception below).
Previous snapshot commit: `e01ebe3e5697c0409f2b684002c1fa6cf78119f0` (`e01ebe3`).
Previous JSON SHA256:
`8f612341cf58796a070dea1372e9c1d9a6608e8b4575468cc077dc6ae0478ac1`;
previous Markdown SHA256:
`6dbb39d4c7db8a9f82e1f1cf856892516164ef09d0c68010c7c7923c0d1ff777`.
Both match actual committed local blobs. Initial inherited checksum audit
matches **259 distinct paths / 442 stored digest claims**.

## New live evidence: libjpeg-turbo on 13226

- **Flow FAIL; parent evidence checks PASS (12 groups).** Native UTC
  **2026-09-12T12:26:18.000Z–2026-09-12T12:26:18.978Z**; supervisor
  **2026-09-12T12:26:17.669Z–2026-09-12T12:26:18.995Z**, 1.324357seconds,
  exit1. Report commit `0b39e0b`; actual runtime remains **13226/fa49059**,
  not the subsequently verified13446gate.
- Three bodyless GETs return HTTP200: homepage **5050encoded/14637decoded**,
  `/pmwiki/pub/lib/pmwiki-core.css` **3609/10554**, and
  `/pmwiki/pub/skins/vgl/pmwiki.css` **2031/4987** bytes;
  total **10690encoded/30178decoded**. Entries, admissions, native transport
  and wire constructions/responses are each3; rejections, redirects and mocks0.
  Wire instrumentation is not packet capture or total header/TLS bytes.
- One homepage commits; **49 anchors inspected**, 16 eligible occurrences,
  14 unique destinations. One genuine current-DOM click selects **`e124`**,
  “Official Binaries: Supported Platforms and Other Notes”, original
  `/Documentation/OfficialBinaries`. It fails `unsupported`:
  **“Float integration with flex, grid and table reflow is not coordinated”**,
  before destination request. No second navigation, retry or fallback occurs.
- Homepage title “libjpeg-turbo | Main / libjpeg-turbo”, root`e1`,
  **475nodes/revision478**, URL and history index0/length1 remain unchanged.
  The bounded census has451visited DOM nodes,468formatting nodes,4deferred;
  raw CSS54properties/9values/14selectors versus applicable19/6/14.
  Those observations are not a sole cause, used whole-page geometry, decoder
  error, server denial/challenge or entire-site verdict.

Parent finishes **2026-09-12T12:30:10.928Z**, **11actual Git objects/8inputs**,
6evidence+6flow groups. Final **136-entry** ledger:
`c99a77fecdfbab567e41cddefe0525541327b7415e87255e19c01e392d8b3f63`.
Sources: `LIBJPEG-TURBO-DOCUMENTATION-FLOW.md`,
`node_modules/.cache/native-validation/native-libjpeg-turbo-flow-september12/`, and `node_modules/.cache/native-validation/html-cell-padding-work-september12/parent-libjpeg-verification/`.

## Separate latest isolated gate: 13446

`HTML-CELL-PADDING.md` and `node_modules/.cache/native-validation/html-cell-padding-work-september12/RELEASE.md` identify commit
`69d74cb23c591d760b8735dc11071406852dbe2d`:
**13446passed/0failed/2unchanged exclusions**,256selected suites/255strict
roots/650manifest entries,1152source/1968compiled files,1142unchanged tracked
inputs and10committed snapshot inputs. UTC:
**2026-09-12T12:46:46.521Z–2026-09-12T12:49:39.170Z**; commit verification
**2026-09-12T12:50:15.584Z**. Existing build/strict/format/native receipts
pass. **220new cases** (154parser/ownership,62integration,4canonical);
**1181focused passes across22suites**. No native test/build is run here.

Exact HTML direct-parent table membership, independently cascaded padding hints
and bounded integer-prefix parsing are isolated code evidence. Percentage-table
width cycle resolution and float/table coordination gaps remain. Computed versus
used collapsed-table padding stays distinct;50vw tests do not fix percentage
width. No post-cellpadding website/replay or general table-model pass is claimed.

**Preserved failure history:** baseline/formatter-only baseline01 each 1/3 on 13226;
fixed00: 1048/61, fixed01/02: 1048/62 expose introduced NaN from the omitted charge
amount; default 1 repairs it. Fixed03: 1103/7 retains wrong fixture assumptions;
fixed04: 1111/0; fixed05: 1181/0. Full **round00: 13445 passed/1 failed** has successful
build/strict/format but a stale quirks-image guard assertion; unchanged case counts
retain unsupported cellspacing coverage before passing round01. Original receipts,
NaN regression coverage and byte-identical canonical baseline remain intact.
Gate: `node_modules/.cache/native-validation/native-html-cell-padding-september12-round01/`.

## Completed existing-host and research follow-ups

- **Netlib13226**, `NETLIB-BACKGROUND-COLOR-FLOW.md` (`afa8dcf`), at
  **2026-09-12T12:09:17.417Z–2026-09-12T12:09:18.308Z**:4GET200,
  **34762encoded/decoded bytes**, genuine FAQ click and different destination
  commit; bounded flow PASS,37readonly checks,8actual parent Git inputs.
  Existing `www.netlib.org` adds0hosts. This was pending at the fourteenth
  cutoff and is now included, not relabeled13446or promoted to whole-site parity.
- **Retained-source investigation**, `HTML-CELLPADDING-INVESTIGATION.md`
  (`32d1a74`), is requirements/test-proposal evidence, not implementation,
  new network, website replay or geometry validation. First import fails
  **12:03:18.890–12:03:18.921UTC**, before native import/parsing.
  Self-directed `attempt01` succeeds **12:04:16.494–12:04:16.823UTC**,
  correcting `dist/` to `dist/src/`:2retained documents/9matches.
  It predates the approximately12:08parent correction message, **not retroactive
  authorization**. No `corrected00` or third extraction occurred; both actual
  45s+5s invocations remain, not the later 40s amendment. Parent subsequently
  accepted existing evidence and prohibited further execution. Parent proof
  ends12:17:53.083UTC, retaining18reviewed-source and8release Git inputs and
  the45-entry seal. Reviewed source payloads are not reopened for this inventory.
- **New primary tables source**, one native13226 GET200 at supervisor
  **2026-09-12T12:22:53.912Z–2026-09-12T12:22:54.060Z**:
  **32212encoded/254858decoded bytes**,0redirects/mocks/subresources/sessions,
  0 new hosts. Four bounded native parser contexts are extracted offline;
  source research is not navigation/geometry acceptance. Existing
  `html.spec.whatwg.org` is already counted. The15-entry spec ledger is
  `0c880e443da24eee88988e53f896370f032429992e328c8da4e35e121f2507d7` under `node_modules/.cache/native-validation/html-cell-padding-work-september12/spec/` and its adjacent
  `SPEC-RECEIPTS.sha256`/`SPEC-VERIFICATION.json`.

## Unchanged evidence and limitations

The last completed Libpng replay remains **13226**,49diagnostics including
41hard guards and8coordinator markers, FAQblocked,23mocks/0wire/0newhosts.
Original badge policy/source, computed-color versus pixels/used-geometry caveats
and older12817/13042replay history remain. **Pending13446Libpng replay is not
consumed.** The paint-order benchmark remains oneBAprocess/54samples with
incompleteAB/BA, slower ordinary/separate medians and no whole-browser-speed
conclusion. Earlier Vim/Kuwasha, PCRE/Tukaani, Expat/Google, Libarchive/S3 and
SourceForge/image-owner qualifiers keep original paths, bytes, runtime labels
and seals. Broader research/provider/passkey/device/TTY/SafeJS/challenge and
full-browser acceptance remain open.

The JSON records **322 consumed input hashes**, including 259 inherited
paths/442 claims. **Scope exception:** the initial inherited hash pass checksum-read
one native source file, `native-gif-image-september12-round00/snapshot01/src/document-images.ts`,
despite the no-reopen instruction. It was neither displayed/analyzed nor executed,
and is not reopened or final-rehashed. This exception is retained explicitly;
all other 321 inputs receive final stable rehashes. No protected payload is
read. Workspace-private `TMPDIR` avoids shared/full `/tmp`.
Only the two new fifteenth files and private helper/temp directory are written;
no shared/historical edits, index/staging/commits/push, native/browser/network,
tests/builds/replay or verifier execution. Parent integration stays separate.
