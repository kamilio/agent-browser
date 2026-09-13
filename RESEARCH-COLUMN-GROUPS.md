# Research reader: implicit column-group endings

The native semantic reader now closes its tracked column-group scope when a
subsequent retained nonvoid start tag follows a topmost `colgroup` directly
inside a `table`. Void columns and intervening whitespace remain unaffected.
The existing row, cell and table-section closure logic can then see the correct
table ancestry instead of accumulating rows beneath a stale column group.

This changes only reader bookkeeping. It does not insert closing tags into the
sanitized source, rewrite the downloaded page, raise a limit or suppress a
resource-limit exception. Orphan, broken-ancestry and cell-contained column
groups retain their existing conservative depth accounting. This is not a
complete HTML tree-construction implementation.

## Verified behavior

- Twenty-eight new cases cover omitted and explicit group endings, repeated
  rows/sections/groups, whitespace/comments, void columns, nested tables, real
  descendant-depth boundaries, independent native DOM depth and malformed input.
- The unchanged baseline fails 22 of those cases and passes six boundary/control
  cases. The repaired focused gate passes all 569 selected tests.
- The canonical native gate passes **18,931 tests**, zero failures and two
  unchanged exclusions: 371 selected files, 370 strict roots and 742 manifest
  entries. The historical strict-root omission and other manifest entries remain
  separate from this pass.
- The original retained W3C Selectors document previously failed `reader.depth`
  at 129 with a limit of 128. It now loads through `loadResearchDocument` as
  **22,522 nodes at depth 13**, with 138 headings and one table. The match-against-
  tree section is queryable. Three read-only queries preserve the document revision.
- Native token metadata confirms the original first table contains a column group
  followed by four columns, `thead` and `tr`, without an intervening group-end
  token. Before and after use exactly the same bytes, limits and token offsets.

The final replay makes no HTTP request. The source retains its September 13,
2026, 11:15:53 UTC capture and original hash. Reader success is not full-page
rendering or interactive acceptance: scripting, styling and hidden-content
semantics remain outside this partial research-reader profile.

See `WEBSITE-TEST-INVENTORY-SEPTEMBER-13-NINETEENTH-UPDATE.md` for build/source
receipts, before/after measurements, preserved diagnostic-wrapper failures and
the separate native-only hardware research visits.
