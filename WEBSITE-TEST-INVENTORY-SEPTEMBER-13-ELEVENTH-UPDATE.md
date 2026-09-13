# Website evidence — September 13, 2026, eleventh update

This adds a fresh native-browser public table-page check to the tenth update.
The download and structural read succeed; **table geometry does not**. Earlier
reports and source captures remain at their original paths and measurements.

## Actual website navigation

Requested: `https://testpages.eviltester.com/styled/tag/table.html`.
Observed same-origin 301 destination:
`https://testpages.eviltester.com/pages/basics/html-tag-table/`.

The native reader runs at 08:35:47.970–08:35:48.420 UTC. One navigation performs
exactly two GETs: the original URL and its observed redirect, not a guessed
replacement or retry. The final response is HTTP 200, 158,955 decoded bytes and
19,112 encoded bytes. Final body SHA256:
`67a13131a7e17cca96ebc7f6e80bbcd21917675d4b99768030e980e3a6c39f16`.
Credentials are omitted. No external stylesheet or script is loaded.

This lane uses independently pinned historical runtime 17,962/base `eb09296`:
`node_modules/.cache/native-validation/native-rich-control-deferral-september13-round01/snapshot01/dist`.
It is not the new 18,046 rich-button runtime and does not rerun or extend that
runtime's native test audit. No Chromium, Firefox or remote browser is used.

## Exact-byte offline observation

One separate socket/process-sealed offline execution runs at
08:35:56.977–08:35:57.199 UTC against the exact captured body.

| Observation | Actual result |
| --- | ---: |
| Parsed DOM nodes | 3,153 |
| Tables | 1 |
| Rows | 5 |
| Cells | 10: 2 header, 8 data |
| Native selector queries | 3 |
| Aggregate query-work units | 54,166 |
| Geometry requests | 1 |
| Returned table rectangles | 0 |
| Offline HTTP requests | 0 |

The observed table is `e3000`, id `mytable`. Formatting retains it as an explicit
deferred table, not an invented usable rectangle. The geometry request reports
`unsupported`; offline exit **1** is preserved. Reported blockers are:

- Stylesheet integrity/CORS is unimplemented for one referenced stylesheet.
- One external stylesheet is not loaded in this intentionally resource-free lane.
- Two CSS values are invalid or unsupported by the current implementation.
- Collapsed-border and caption layout each retain one diagnostic.

These categories are observations, not proof of independent root causes.
Collapsed-border support already exists for admitted native profiles; this
result does not imply it is universally absent. Caption wrapper/border geometry
and this page's particular table/style constraints need isolated follow-up.
No HTML/CSS rewriting or diagnostic suppression is used to admit geometry.

Six scripts are not executed. The probe collects bounded structural attributes,
not copied page text, and performs no click, filling, submission, login or other
interaction. The parsing/formatting pass is partial and is not full rendering,
site compatibility or performance acceptance.

## Integrity and remaining work

Evidence:
`node_modules/.cache/native-validation/native-testpages-table-september13/`.
`RESULT.json` records both URLs, raw operation counts, actual native failure,
runtime pins and explicit limitations. `EVIDENCE.sha256`:
`471cd6a2373585d3cc4b11946872a9874c8c0000943048931d787c2341bbf439`.

Source/compiled inventories match before and after both executions. Native
transport closure, absent process groups, zero unexpected guard attempts and
empty private HOME/TMP removal verify. Offline document owners close to zero
nodes. The live lane does not separately report a document-node closure count;
transport closure and process absence are the available live cleanup evidence.
No credential/device, SafeJS, real TTY or challenge-handling gate is exercised.

The current table-page URL is a useful further-testing candidate: resource
loading and integrity policy, captions, table borders, real geometry and later
interaction still need separate bounded tests. Wikipedia's rich-button
improvement remains documented in the tenth update; neither page has a full
rendering pass. The overall browser and original research goals remain open.
