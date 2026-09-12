# Libpng retained-DOM presentation-hint census

## Result and production target

The pinned 13042 source and retained Libpng evidence identify **49 hard guard
occurrences across 41 distinct elements**, separate from **8 table coordinator
markers**. The eight deferred display entries **do not establish eight missing
table algorithms**. Existing native table layout, sizing, painting and click
coordination code/tests are present. This report qualifies the earlier sealed
follow-up's broad table-blocker wording without changing any historical report.

The narrow next production target is **bounded HTML tr bgcolor presentation
hints**, initially valid six-digit hex colors, routed through the existing row
background paint path and author cascade. The actual inputs are six
`tr bgcolor="#000080"` and two `tr bgcolor="#007000"`.
They account for eight independent hard occurrences. This is a recommendation,
not an implementation or a claim that this patch alone makes Libpng pass.

No BrowserSession, navigation, click, mock, network request, website/spec fetch,
resource-loaded replay, formatting build, width solver, geometry or raster
computation was run in this task. No source, shared docs, TASKS, manifest, index,
staging, commit or push changes were made. The separate parent PCRE work is
outside this census and was not investigated or modified.

## Exact counts: occurrences are not attributes

| Retained guard class | Per-element guard occurrences | Causing attribute occurrences |
| --- | ---: | ---: |
| html-presentation-hint-not-supported | 31 | 43 |
| html-table-presentation-hint-not-supported | 16 | 16 |
| inline-vertical-align-not-supported | 2 | 2 inline style attributes/declarations |
| **Total hard guards** | **49** | **61** |

The same eight table elements occur in the first two classes, yielding **41
distinct guarded elements**, not 49. Generic guards are: 8 tables, 10 td cells,
7 images, and 6 center-aligned text/container elements (div, h1, h3, h4, h5, p).
An element with both align and valign emits one generic guard, not two; the ten
td elements therefore contribute 10 guards but 20 attribute occurrences.
The two width=100% table attributes share elements with border=0; the eight
tables contribute 8 generic guards but 10 generic attribute occurrences.

Table-specific guards are exactly 8 table cellpadding=5 elements and 8 tr
bgcolor elements. The inline vertical-align cases are the two radio inputs
with IDs **ysvs1** and **ysvs0**, actual inline style
`vertical-align: middle`, native computed display **inline-block** and
computed vertical-align **middle**. These are not table vertical-alignment
failures. The commented-out Yahoo image is not counted as an active element.
Image width/height and supported image-border attributes retain the source's
existing exemptions; no exemption was added by this census.

### Grouped bounded attribution

The table lists every tag/attribute/value group and one structural example per
group. Example refs are **reconstructed parse refs**, not a blanket assertion
that every original live ref was retained. Structural paths identify nodes in
the exactly matching serialized DOM. Complete per-element occurrence records
and up to five examples per group are in `CENSUS.json`.

| Guard class | Tag | Attribute | Value | Attribute count | Example reconstructed ref and current-DOM path |
| --- | --- | --- | --- | ---: | --- |
| html-presentation-hint | `div` | `align` | `center` | 1 | `e147`; `/#document/html[1]/body[1]/div[1]` |
| html-presentation-hint | `h1` | `align` | `center` | 1 | `e114`; `/#document/html[1]/body[1]/center[2]/h1[1]` |
| html-presentation-hint | `h3` | `align` | `center` | 1 | `e118`; `/#document/html[1]/body[1]/center[2]/h3[1]` |
| html-presentation-hint | `h4` | `align` | `center` | 1 | `e123`; `/#document/html[1]/body[1]/center[2]/h4[1]` |
| html-presentation-hint | `h5` | `align` | `center` | 1 | `e1073`; `/#document/html[1]/body[1]/center[4]/h5[1]` |
| html-presentation-hint | `img` | `align` | `bottom` | 1 | `e420`; `/#document/html[1]/body[1]/p[9]/img[1]` |
| html-presentation-hint | `img` | `align` | `middle` | 1 | `e154`; `/#document/html[1]/body[1]/div[1]/form[1]/a[1]/img[1]` |
| html-presentation-hint | `img` | `align` | `right` | 5 | `e190`; `/#document/html[1]/body[1]/dl[1]/dd[1]/a[1]/img[1]` |
| html-presentation-hint | `p` | `align` | `center` | 1 | `e95`; `/#document/html[1]/body[1]/center[1]/p[1]` |
| html-presentation-hint | `table` | `border` | `0` | 8 | `e23`; `/#document/html[1]/body[1]/table[1]` |
| html-presentation-hint | `table` | `width` | `100%` | 2 | `e23`; `/#document/html[1]/body[1]/table[1]` |
| html-presentation-hint | `td` | `align` | `center` | 10 | `e28`; `/#document/html[1]/body[1]/table[1]/tbody[1]/tr[1]/td[1]` |
| html-presentation-hint | `td` | `valign` | `middle` | 10 | `e28`; `/#document/html[1]/body[1]/table[1]/tbody[1]/tr[1]/td[1]` |
| html-table-presentation-hint | `table` | `cellpadding` | `5` | 8 | `e23`; `/#document/html[1]/body[1]/table[1]` |
| html-table-presentation-hint | `tr` | `bgcolor` | `#000080` | 6 | `e375`; `/#document/html[1]/body[1]/center[3]/table[1]/tbody[1]/tr[1]` |
| html-table-presentation-hint | `tr` | `bgcolor` | `#007000` | 2 | `e26`; `/#document/html[1]/body[1]/table[1]/tbody[1]/tr[1]` |
| inline-vertical-align | `input` | `style` | `vertical-align: middle` | 2 | `e167`; `/#document/html[1]/body[1]/div[1]/form[1]/font[1]/font[1]/input[1]` |

## Linkage, source-only scope and the doctype trap

The successful recording runs at **2026-09-12T11:04:14.108Z through
2026-09-12T11:04:14.425Z UTC**; its supervisor spans **2026-09-12T11:04:14.065Z
through 2026-09-12T11:04:14.439Z**, 0.371173 seconds.
It uses the already-sealed original HTML response: **32857
bytes**, SHA256 `50ec9ab7655ee476c78e3ff45630a51e459c8bdff8071c73a03056860f4db480`, decoded using the retained
**windows-1252** encoding, with the original public/system Transitional doctype.
No bytes, attributes, doctype or source mode are rewritten or forced.

Native source-only parsing yields **1172 nodes**, **quirks** mode, scripting
false. Its serialization is exactly the **33066-byte** retained DOM with SHA256
`266b3357fdfad8deeba08c187ceaf3c62f4794e3267bd072494d90254750afbe`. All **137 available reference checks**
match (40 table structural samples, 96 anchor samples, one badge). The source
predicate counts independently equal the retained resource-loaded formatting
totals **31 / 16 / 2**. Native source-only styles report **3 rules / 14
declarations**, raw CSS issues **{}**, applicable CSS issues **{}**.

**Scope gap:** the old recording did not retain a complete formatting-node list
or per-hint emission events. These are exact reconstructed structural
attributions using unchanged source predicates, not retroactive event logs.
Only the available 137 refs are cross-checked against retained ref observations;
no universal original-ref claim is made. Source-only parsing/styles do not
reconstruct loaded image owners, session history or used geometry. Those remain
historical observations in the sealed replay, not new measurements here.

The first actual parse used the retained serializer output. It correctly
failed the identity assertion: the serializer emits only a doctype name at
`/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/html-serialization.ts:105`, losing the original public/system
identifiers. Reparsing `<!DOCTYPE html>` yielded **1174 nodes** and
**no-quirks**, not the original 1172-node quirks DOM. The failed hash and
observation remain in `PARSE-OBSERVATION.json`. The assertion was not
weakened; recovery instead used the sealed original response bytes and the
recorded charset, following the source decode/parse path documented at
`/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/document-loader.ts:84` without executing that loader.

## Why the eight display entries are not hard table-algorithm failures

Static source call path, not a newly executed geometry trace:

1. `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/session.ts:1042`: genuine click checks actionability, then calls
   scrollTargetIntoView at line 1067. Its session helper is at
   `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/session.ts:948` and geometry use at
   `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/scroll-into-view.ts:148`.
2. `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/document-geometry.ts:498` calls layoutDocument in refresh.
   `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/document-layout.ts:217` delegates to layoutPageDocument.
3. `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/flex-document.ts:32` builds the formatting tree and follows the
   ordinary coordinated page path. At `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/flex-document.ts:63`,
   contentMode flex/grid/table or atomic inline nodes select coordination;
   resolveFormattingPageWidths receives the shell callback at line 76.
4. `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/formatting-tree.ts:1472` computes the number of flex/grid/table
   coordinator nodes. Lines 1487–1499 reject non-advisory issues **except**
   display-layout-not-supported when a coordinator callback is present and its
   count equals that coordinator-node count. It is a count-matched integration
   exception, not a general suppression of display or other guards.
5. Table roots deliberately emit display markers at
   `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/formatting-tree.ts:887`. Existing dispatch at
   `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/flex-document.ts:141` calls layoutFormattingTableContainer;
   the actual algorithm starts at `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/table-layout.ts:133` and uses
   native table structure, column and row sizing modules.

The retained eight markers all have contentMode **table** and match eight
table roots. None of the **31 generic, 16 table-hint or 2 inline-align** hard
occurrences qualifies for the display exception. Those **49 occurrences**
therefore still make the early width gate reject the page even with the
coordinator. The standalone resolveDocumentBlockWidths helper at
`/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/formatting-tree.ts:1457` calls the width resolver without that
callback; its rejection must not be confused with the coordinated page path.

No guards were deleted, no filtered formatting tree was solved, and no
counterfactual rectangle was calculated. Existing algorithms may have further
limitations once current hard guards are implemented; this census is not proof
that removing any chosen attribute subset is sufficient for full-page layout.

## Narrow patch recommendation and existing tests

Recommend one focused production change: accept **valid bounded six-digit hex
bgcolor on HTML tr** as a low-priority background-color presentation hint and
feed the existing row background painter. This accepts a semantic color subset,
not a site/domain or two-color whitelist. Keep unsupported legacy color forms,
other element roles and every other table attribute guarded until separately
implemented. The broad table-hint predicate at
`/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/formatting-tree.ts:655` must skip only the successfully implemented
bgcolor attribute, not the entire element: cellpadding/cellspacing/rules/frame/
background on the same node must remain independently detectable.

Why this patch: all eight affected tr nodes carry a bgcolor and no other
table-specific guard attribute in this capture, and the native row background
path already has concrete tests. It avoids starting a new table layout engine,
image-float alignment, generic centered-child layout, or inline-control baseline
implementation. Other observed blockers remain: 8 cellpadding hints, table
border/width attributes, 10 td align/valign pairs, 7 image align hints, 6 generic
align=center hints, and 2 radio vertical-align declarations.

Relevant existing tests, inspected but **not rerun** in this task:

- `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/table-document.test.ts:54`: coordinated table/row/group/cell
  rectangles and following flow; line 89 checks ownership; line 102 paints row
  layers beneath a spanning cell. These demonstrate an existing table path.
- `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/table-document.test.ts:205`: empty real row geometry/background;
  line 230 tests a genuine native table-cell anchor click. A bgcolor follow-up
  should pair equivalent CSS and attribute row-paint cases here.
- `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/table-styles.test.ts:427`: actual **1px UA cell padding** and
  header/data-cell alignment; this is not table cellpadding=5 support. Nearby
  reset/cascade tests cover initial/unset/inherit/revert and author longhands.
- `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/table-percentage-document.test.ts:410` explicitly retains HTML
  table width-attribute rejection rather than conflating it with CSS widths.
- `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/table-formatting.test.ts:608` retains non-baseline vertical-align
  rejection for inline/inline-block/inline-flex.
- `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/quirks-image-layout.test.ts:703` preserves independent image
  align/hspace/vspace/valign guards; `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-quirks-image-september12-round01/snapshot01/src/center-layout.test.ts:299`
  preserves generic align guards and also contains coordinated-table coverage.

Risks/tests for the proposed patch: author CSS/inline/important precedence;
all and revert semantics; attribute mutation invalidation and removal; malformed
or oversized values and unchanged work bounds; non-HTML namespaces; row/cell
paint ordering, spanning cells and empty rows; guards for other attributes on
the same node. No full HTML legacy-color, standards-parity, performance or
full-FAQ acceptance claim follows. No production implementation is included.

## Evidence verification, bounded attempts and preserved failures

Pinned production commit: `96541506e7878af0bea70ed002bf13111765da3c`. Before/after checks verify
**20 release receipts, 1144 source files, 1960 compiled files, 10 actual committed
inputs in 13 captured Git objects**. Git objects are captured outside the
kernel seal and cryptographically linked to the commit and snapshot inside.
The full original capture, 12817 baseline and 13042 replay ledgers are also
checked (242 / 219 / 231 entries respectively). The 13042 ledger remains
`a2e1d9686d3830764e18fdfa6901dd719b03a02673a0a1fa6d5ba871269e01a7`. Existing reports and their earlier failures remain
unchanged. The production release's 13042 tests are verified prior evidence,
not a newly rerun suite or live validation.

Predeclared per-child limits remain **30s wall + 5s kill grace, 6 MiB file/output,
16 MiB lane, 64 MiB minimum free**. Private empty HOME/TMP, explicit environment,
DEVNULL stdin, no TTY, no credential/.env/password/provider/device access.
Socket/socketpair and related network syscalls are unconditionally denied;
JavaScript network/subprocess/addon APIs are denied. There are no socket
self-probes. The final output is **58527 bytes**, stderr
**0**, with no supervisor timeout/truncation/signals; process group is absent.

Original native DOM bounds (50000 nodes, depth 256, 2000000 text units, 1024
changes) and stylesheet bounds are unchanged. Each guard class is capped at
64 records, examples at 5/group, attributes at 24/element and 256 code units.
Static source excerpts are capped at 40 sections, 100 lines/section and 1800
lines total. Actual source excerpts and full file/excerpt hashes are sealed.

Three failed attempts are preserved, not disguised as successful checks:

| Lane subdirectory | Supervisor start UTC | Exit | Stderr bytes |
| --- | --- | ---: | ---: |
| `census` | 2026-09-12T10:58:54.799Z | 1 | 1118 |
| `census01` | 2026-09-12T11:00:45.709Z | 1 | 757 |
| `census02` | 2026-09-12T11:02:48.548Z | 1 | 1054 |

- First: module-link guard stopped before parsing. Native source-only styles
  transitively import selectors/focus/scroll/geometry definitions. The revised
  harness admits pinned transitive definitions but still disallows session,
  transport, loader, realSafeJS and direct resource/layout APIs. Actual import
  edges are retained; importing definitions is not invoking layout.
- Second: serialized-DOM parse failed strict identity because of doctype
  metadata loss; its no-quirks/1174-node result remains unmodified.
- Third: original-source parsing and all guard-count assertions succeeded,
  but an uncaught post-close styles.metrics() observation correctly threw
  closed before aggregates were persisted. Its receipt and scripts remain.
- Final recording: persists aggregates before closing, catches that expected
  closed-owner error and retains the actual cleanup observations. Document
  nodes/text are zero and mutation/styles owners are closed.

Measured cumulative total: **3 source-only parses** (one identity failure,
two successful original-source reconstructions), **1 complete persisted census**,
and **1 pre-parse import failure**. All are strictly offline; there are **0
browser sessions/navigations/clicks/mocks/HTTP calls/resource loads/formatting
builds/geometry calls/new hosts**. The amended preparation notes explain why
the original one-parse estimate changed. No further census is needed.

## Artifacts and handoff

Private lane: `/home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-hint-census-september12`. Primary data: `CENSUS.json`,
`CENSUS-DATA.json`, `SOURCE-EXCERPTS.json`,
`PARSE-OBSERVATION.json`, `PARSE-RECOVERY.json`,
`PARSE-FINAL.json`, `IMPORTS-census03.json`,
`census03/EXECUTION.json`, `GIT-COMMANDS.json`,
`PREPARE-COPIES.json` and `CHECKS.json`. Failure directories and
exact executed harness versions under archive/ are included in the seal.

The report and all lane files are sealed by `ARTIFACTS.json`,
`SEAL.json` and `FINAL-RECEIPTS.sha256`. Read-only command:

`env -i PATH=/usr/bin:/bin /usr/bin/python3 -I -B /home/kjopek/project/agent-browser/node_modules/.cache/native-validation/native-libpng-hint-census-september12/offline.py verify`

This verifier validates 7 input-evidence groups and
5 census-artifact groups plus the final exact file set.
It uses only hashes, retained JSON/source checks and arithmetic; **no native
parse/style/census/layout computation or browser run is repeated**. Parent
independent verification is required before using this recommendation.
Full website/FAQ, standards, live/SafeJS/TTY/provider/device/performance and
challenge-handling gates remain open.
