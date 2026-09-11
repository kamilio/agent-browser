# Native table document integration — September 11, 2026

This slice connects the previously isolated table-slot and column-sizing
primitives to real native document layout. It is a bounded separate-border,
automatic, block-table implementation, not complete CSS table conformance.
It does not use Chromium, Firefox, a remote browser, CSS Grid substitution or
an additional page-runtime dependency.

## Implemented path

- `DocumentStyles.table` owns lazy computed table properties, inherited spacing,
  CSS-wide values, variables, stylesheet/inline cascade and invalidation. HTML
  defaults include table spacing, inner display roles, cell padding, row/cell
  vertical alignment and header centering. The existing font model does not
  provide bold header glyphs.
- Formatting retains real table/group/row/cell references and repairs orphan
  CSS table roles with anonymous boxes. This includes a real HTML table styled
  `display:block` around a table-row-group. Irrelevant whitespace is removed
  without detached records; meaningful generated-cell whitespace is retained.
  Compaction remaps every formatting ID after list-marker resolution.
- HTML cell spans feed bounded slot placement; zero row spans end at their own
  group. The first header/footer groups receive their appropriate visual order
  without changing DOM references. Overlapping/malformed unsupported grids fail
  explicitly instead of silently moving a cell into a different slot.
- Actual cell intrinsic widths determine the shrink-to-fit table width and
  shared column tracks. Cells reflow at their spanned widths. Row sizing uses
  natural cell border boxes, row/table height minima, baselines and top/middle/
  bottom alignment. Content shifts inside stretched cells without moving their
  outer borders. Table height cannot squash taller measured rows.
- Retained row/group/cell boxes participate in client geometry and hit ownership.
  Row/group backgrounds precede cell painting, including row-spanning cells.
  Empty real rows retain a background and hit area across an explicit table
  width. Table spacing targets the table rather than an unrelated ancestor.
- The same path serves genuine `BrowserSession.click` pointer events and
  navigation; tests do not replace those operations with direct navigation or
  synthetic dispatch. Nested normal-flow tables and cell content use the native
  document coordinator rather than a parallel fake geometry tree.

Cell margins and cell maximum widths are ignored consistently in this bounded
used-value profile; computed CSSOM still exposes the author values. The policy
is applied before intrinsic measurement as well as final placement, preventing
different stages from selecting incompatible table widths.

Extraction still traverses the original DOM rather than the repaired formatting
tree. Corrected UA displays classify thead/tfoot/caption/colgroup wrappers as
containers rather than inline wrappers; their real references, text and DOM
order remain intact. Corresponding structured/Markdown extraction assertions
are updated. Historical extraction reports retain their earlier-version output.

## Explicit limitations

Guards remain for inline tables, table items in Flex/Grid, captions requiring
wrapper geometry, column/column-group layout, fixed layout, collapsed borders,
hidden-empty-cell painting, positioned table roles, unsupported percentage
sizing cycles, percentage-height cell descendants, role maximum heights and
explicit group heights. Unsupported control/atomic/nested-table baselines are
not guessed. Nonbaseline inline vertical alignment remains guarded even though
the table-property parser recognizes its keywords. HTML table presentation
attributes such as cellpadding/cellspacing/border are not silently discarded.

The general float, overflow, CSS import, external-SVG decoding, CSP, font and
other native capability limits are unchanged. A coordinated table shell is not
an issue-free standalone width-only tree: the table-aware document coordinator
is required. No CAPTCHA solving, access-control bypass, credential/device probe,
SafeJS runtime acceptance or complete research outcome is claimed here.

## Validation history

- `table-document-work-september11/helpers01`:143 passed,1 failed. The failure
  was a test helper default masking an explicit undefined malformed input; the
  corrected test calls the API directly.
- `table-document-work-september11/fixed01`:1040 passed,4 failed. Findings were
  a table-height coordinator bug, a newly explicit composition-guard expectation,
  an incorrect CSS-wide custom-property fixture and a pre-existing legacy Grid
  rejection assertion in an additional intrinsic suite.
- That legacy intrinsic suite was rerun against clean commit
  `2ea6d50cc2ae5aecfb081f9b65cc2fb04c28bb3e`:96 passed, the same1 assertion failed.
  It is left unchanged and was not part of the established164-file release
  selection. This is not described as a newly fixed or passing suite.
- `table-document-work-september11/fixed02`:953 passed,0 failed,0 skipped across
  20 focused files. Source inputs remain unchanged. Coverage includes actual
  geometry, span/group placement, vertical alignment, painting, hit testing,
  mutation invalidation, nested content and a genuine native anchor click.
- The first broader gate builds successfully, then strict test compilation finds
  a missing explicit declaration-count argument in a new fixture. No broader
  native pass is claimed for that attempt. The fixture is corrected;
  `table-document-work-september11/fixed03` again passes953 checks across20 files.
- Broader round02 reports10120 passed,3 failed,2 existing exclusions. Those
  failures identify the directly affected extraction expectations and a scoped
  measurement guard fixture that used a now-supported block table. Expectations
  now reflect the corrected UA roles; the guard fixture uses an unsupported
  inline table instead, without relaxing its assertion or adding exclusions.
- `table-document-work-september11/fixed04` passes1260 checks across23 files.
  Broader round03 then catches one indentation error in that edited guard
  fixture before native execution. After correction, fixed05 again passes1260
  checks with no failures/skips. Earlier failed lanes remain immutable.

All lanes above are under `node_modules/.cache/native-validation/`. They are
isolated native checks with socket/process guards, private HOME/TMP and the
explicit clean manifest. They are not fresh website visits.

## Audited release gate

`native-table-document-integration-september11-round04` passes build, strict
typing, formatting and **10123 native checks,0 failures,2 unchanged exclusions**.
It selects170 files and169 strict roots from574 clean manifest entries, not the
entire repository suite. The264 checks in the six new table test files all pass.
The existing snapshot strict omission and two named runtime exclusions remain
explicit in `AUDIT.json`; neither is declared fixed.

UTC execution:20:53:04.875–20:55:20.562; independent audit20:55:34.412. The snapshot
contains1059 source inputs and1900 compiled artifacts:24 owned source/test files,
the clean six-entry manifest addition and1034 unchanged tracked inputs. Four
pre-existing dirty production residuals are independently verified unchanged and
excluded from the release. Parent verifies both inventory ledgers and all20 gate
receipts. Earlier failed gates and the extra baseline intrinsic failure remain
preserved, not relabeled as successful runs.

- Source inventory SHA-256: `eddbf8d3976c022f0286b48bd958dfceab99b8cb5df8810319ba9bc6f350049b`.
- Compiled inventory: `ed56ad5206a7fa7eeac5fb8a4aa00c8f23a3e6421387507a3a50a5f3c1d467cf`.
- Native results: `861959a82292ef2a6146099379d04a90179f596f3de40528e5160e038dffbed8`.
- Summary: `037155a8882629fb2d040809287f3a4d69751da14d6a70e0f41b06ddc7f14860`.
- Audit: `0917ce1c345170f014885199f3abf475dbc3dba9f04285bcf5d635c2bc6fab22`.

The captured W3C follow-up remains a separate acceptance step; these native
fixture results do not establish that the live W3C or Test Pages flow now works.

## Original-content follow-up

`W3C-TABLE-DOCUMENT-REPLAY.md` records the later21:07 UTC replay using this committed
release. All three original resources remain intact;3 native mocks and0 wire
requests commit the document. Five coordinated tables now retain40 rows and80
cells, but the genuine fragment click still fails the width-profile guard.
Retained non-advisory CSS diagnostics continue to reject the complete profile;
the five non-CSS shell counts alone do not explain the guard decision. No cell
geometry or partial render is forced after failure. All49 evidence checks and
both ledgers verify. CSS/import/CSP and full original-page acceptance remain open;
this outcome does not weaken or replace those guards.
