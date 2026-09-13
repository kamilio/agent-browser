# Website testing inventory: September 13, thirteenth update

This update records native-only diagnostics and exact-byte replays, not new
website visits. Two retained public pages are used: CSSOM View and TestPages'
HTML tag table. All previous captures, failed runs, paths and measurements remain
unchanged. There are zero new HTTP requests in this update.

## Reader failure diagnosed before changing code

The retained CSSOM response comes from the native GET at 09:04:24.921 UTC:
`https://drafts.csswg.org/cssom-view/`, HTTP 200, 1,196,447 decoded bytes,
SHA256 `8ef0a42bbe635083640f0f80c635e4efffd6ff7b81269f719aedabf50d66f091`.
Its original semantic-reader source extraction failed before retaining any
algorithm paragraphs. That failure stays in `native-caption-cssom-source-september13/`.

A new native full-loader/reader comparison first fails at 09:16:18 UTC because
the diagnostic harness reads a nonexistent `text` field rather than native
text-node `data`. It closes its owner and produces no completed comparison.
Evidence lane: `native-reader-anchor-compare-september13/`; ledger SHA256
`7492bca13ecbd4583fe33c5f801ac4ada0e7b7c757cae10de653638b587cc12c`.

The separately corrected comparison runs 09:17:17.477–09:17:18.232 UTC using
audited 18,111. On identical bytes, the full loader retains 35,442 nodes and
finds real `dfn` targets `e8343` and `e8656` for the two rectangle methods.
The semantic reader retains 32,355 nodes and finds neither. Two loads/two
selectors use 394,165 and 349,013 query-work units respectively. There is no
raw-body search, alternate parser, DOM rewriting or algorithm extraction.
Evidence: `native-reader-anchor-compare-september13-round01/`; ledger SHA256
`fe203fe47ee2e54173160f26f184ab73adda18eeda26159a76513cb6a59be1d3`.

## Repaired reader recovers the actual source algorithms

The reader now retains passive `dfn` and preserves IDs on other non-omitted
unwrapped elements as empty point anchors. Unknown-element content stays
unwrapped; omitted active/foreign subtrees stay omitted. READER-POINT-ANCHORS.md
documents the distinction and its implications for target-scoped extraction.

One new sealed native reader execution runs 09:31:20.207–09:31:20.674 UTC on
audited 18,149, using the exact retained CSSOM body with no HTTP. It retains
32,703 nodes, with unchanged revision 32,702 during inspection. Both selectors
find one target: `e7515` and `e7828`. Their work totals 595,336; bounded native
traversal uses 35,115 units. Six exact retained-text blocks total 2,006 code units
with no omissions. All four requested source-coverage checks pass.

The extracted algorithms establish content-order border fragments, inclusion
of table and caption boxes rather than their anonymous container, and bounding
rectangle behavior for empty/degenerate/nonempty lists. This verifies those
source statements; it does not establish complete geometry conformance, SVG,
transforms, inline-table layout or rendered website correctness.

Evidence: `native-reader-cssom-september13/`, including `EXCERPTS.json`, native
references, exact-text hashes and original capture provenance. Ledger SHA256:
`3bb5e08afb912247ecf3671e52f78f4d7d776b6f535401109e4db20439dfb557`.
The source's receive date remains 09:04:24.921; the 09:31 execution is an offline
reading, not a second download or a newly observed server response.

## TestPages: less caption bookkeeping, same unresolved rendering gates

One separate native replay runs 09:31:20.269–09:31:20.569 UTC on audited 18,149.
Input is the original 158,955-byte body at
`https://testpages.eviltester.com/pages/basics/html-tag-table/`, SHA256
`67a13131a7e17cca96ebc7f6e80bbcd21917675d4b99768030e980e3a6c39f16`.

The table-node index replaces the all-formatting-node caption scan. Comparing
against the previous 18,111 replay on identical bytes:

| Measurement | Previous | New |
| --- | ---: | ---: |
| Native DOM nodes | 3,153 | 3,153 |
| Visited formatting DOM nodes | 3,073 | 3,073 |
| Formatting boxes | 3,894 | 3,894 |
| Outside markers | 276 | 276 |
| Formatting text code units | 9,272 | 9,272 |
| Formatting work units | 234,223 | 230,608 |
| Raw deferred coordination shells | 1 | 1 |

The reduction is 3,615 work units, approximately 1.54%; it is not a wall-clock
speed benchmark. Computed styles, table/caption wrapper ownership and formatting
diagnostics compare equal. Grid `e3000` and caption `e3002` remain under wrapper
3617; no caption ownership or layout feature is removed to reduce the count.

The one geometry request still returns unsupported: stylesheet integrity/CORS,
an unloaded external stylesheet and two unsupported/invalid CSS values. No
rectangle exists. Inspection exit zero is not full website success. The replay
uses one load, three selectors, one formatting inspection, one geometry request,
and zero HTTP, scripts, actions or raster calls.

Evidence: `native-caption-index-page-september13/`; ledger SHA256
`5c5b4687d6ab299c73229d34647aa70a37405d6fd81070b0eb5b3d3c4910c567`.
The previous caption replay remains at `native-testpages-caption-september13/`
with its original 234,223 measurement, and the older 17,962 failure retains exit
one at `native-testpages-table-september13/`.

## Native regression gate and integrity

New tests: 29 reader-anchor cases and nine caption-index cases. Unchanged
production yields 7 pass/31 fail. The final focused run passes 815 cases across
15 suites/15 strict roots, zero failures or exclusions. Three prior reader
assertions are updated to require distinct point anchors rather than discarded
IDs; no exclusion hides these changed semantics. Initial formatting and failed
expectation runs remain recorded.

Clean broad validation runs 09:26:57.168–09:31:07.762 UTC; audit at 09:31:07.870.
It passes 18,149 cases, zero failures and two unchanged historical exclusions,
across 354 suites/353 strict roots. The 732-entry manifest leaves 378 suites
unrun. Build, strict checking, formatting and source integrity pass. The audit
binds 1,267 source files, 2,100 compiled files and 1,261 unchanged tracked inputs.
The historical snapshot strict-root omission and two historical exclusions stay
explicit; this does not claim all manifest tests passed.

Audit base: `6a2cf0dcbcf55509f0e8b0248c29ea17e24269bd`.
Audit lane: `native-reader-anchors-september13-round00/`.
Source ledger: `b633472e12a8584b09ffc0d0ddba2f90a81b74811a081b2ca5a02bc3da39d9d1`.
Compiled ledger: `670d9871554d16a09d0076ebc9011490887c5234c8631ad91bc7fc464cd03ecf`.
Native result: `56886b86e4779095ad53fc95f8a54c70bddea790edbe13e23005dccb8ba8b655`.
Summary: `68419a885ddfe92b75f2df02b5437543d6b8212b2839c983d15a2a24e314a5b3`.
All evidence lane names above are under `node_modules/.cache/native-validation/`.

Both new replay lanes verify source/compiled pins before and after, close native
owners to zero nodes, record zero guard/process attempts, confirm absent process
groups, and remove empty private HOME/TMP directories. No credentials, devices,
SafeJS, TTY/PTY, challenge interaction or other browser is used. Root dist and
pre-existing uncommitted work remain untouched; no push is part of this update.

## Next gates

Investigate the actual TestPages stylesheet/integrity and CSS diagnostics without
silently weakening resource policy. Continue varied-site coverage separately
from retained-byte replays. The hardware, benchmark, Astra chatter and Poe
research requests are not complete. Real password/passkey devices, SafeJS,
real TTY and human challenge handoff remain separate open gates. The overall
browser improvement goal remains active.
