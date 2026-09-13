# Website test inventory — September 13, twenty-first update

**Verified feature progress, with three explicitly retained baseline failures.**
The native reader now preserves bounded explicit ARIA table source declarations
and the existing JSON table-metadata option exports them. This is reusable
browser functionality, not another site-specific full-DOM extraction procedure.
The overall browser goal and original four research topics remain open.

## Implementation

- New `ariaTableSource` records expose original native tags, a supported single
  declared role and raw allowed attributes under `tableMetadata: true` plus JSON.
  HTML `tableSource`, native node types and default extraction remain separate.
- Explicit table/rowgroup/row/cell/header declarations, labels, ID references,
  counts, indices, spans and ownership strings survive supported reader tags.
  No computed accessibility role, header assignment, reparenting, column grid,
  numeric repair, implicit span or visual association is manufactured.
- Unsupported role lists, grids, rewritten/unwrapped tags, events, styles and
  arbitrary attributes are not silently admitted. Each metadata value stays
  within4096UTF16units and existing reader/extraction budgets remain enforced.
- New regressions exposed decoded carriage returns being lost at the reader's
  second HTML parse. Native newline preprocessing plus re-escaping decoded CR
  repairs the root cause while retaining original source-size accounting and
  charging emitted escapes to the output limit.

Contract, public API and limitations: `ARIA-TABLE-SOURCE.md`.

## Native validation: expanded coverage is not all green

Canonical source/runtime:
`native-aria-table-september13-round00/snapshot01/dist`, based on
`bdab3fdce00f5a68ddd103dae1470b66dffdfe12`.

| Gate | Actual result |
| --- | --- |
| New regression cases | **108 pass**; unchanged baseline62fail/46passing controls |
| Corrected focused run | **917pass/3baselinefail**, zero skips,11suites |
| Expanded native run | **19269pass/3baselinefail/2unchangedskips** |
| Manifest coverage | 376selected suites,375strictroots,744manifest entries;368outside run |
| Build/strict/format | All pass; source inputs stable |
| Source and compiled inventories | 1284source files,2120compiled files;1277unchanged tracked inputs |

The expanded full run starts **2026-09-13T12:47:21.135Z**, finishes
**2026-09-13T12:51:49.276Z**, and its native command genuinely exits1. The audit verifies
the exact known failures; it does not relabel the suite as passing. All prior
selected suites retain their previous passing/skipped outcomes. Three previously
unselected existing suites add233cases, alongside108newcases; their230passes and
three actual failures are counted separately from the new feature regressions.

The three unchanged baseline-confirmed failures remain selected:

1. `research-section.test.ts`: an argument-validation assertion still expects
   `h2::before` syntax to be rejected after prior pseudo-selector support.
2. The same suite's runtime-validation assertion has the same expectation.
3. `table-source.test.ts`: a blanket negative string assertion includes a value
   that already survives as a globally preserved `id` on a non-table element.

No unrelated source/test changes or new skips hide these results. The existing
focus-provisioning and media-fallback exclusions remain two separate skips.
The historical snapshot strict-root omission is unchanged.

Source ledger: `da2e046c498fa6719cd0cdac31e07309b6a1a96998492a868bb36c4b92f8cfb1`.
Compiled ledger: `01e9d2430852e62fbbac66a303c8be200305f835a990383bf187290ec9e55283`.
Native result: `20ac2805f0fc27abdff24f9f229f0d8f358369fea57a681d0584f30fa29283fe`.
Summary: `0e2af382dcd5e6d3d32adbad6c6bc0ac859dc3efd73aea449c711e060993497a`.
Full audit and hashes: `native-aria-table-september13-round00/AUDIT.json` and
`RECEIPTS.sha256`. All artifact names here are relative to
`node_modules/.cache/native-validation/` unless marked as root documents.

## Apple: production reader/extraction before and after

Original source: `https://www.apple.com/mac-studio/specs/`, captured
**September13,2026 12:01:16.690UTC**,215392bytes; no new request.
SHA256 `30358c53dc69af1d99b3ebd63d686cbe8e8e5362536a9376bc93a3aff28608f4`.

Each phase uses exactly one native long-v1 reader load, four queries and one
production `extractDocument` JSON call, with unchanged default raw policy and
document limits. There is **zero HTTP and no full-DOM reload** in either phase.

| Measurement | Before (18931-pass build) | After (expanded audited build) |
| --- | ---: | ---: |
| Native nodes | 2426 | 2426 |
| Extracted nodes | 1475 | 1475 |
| ARIA table query matches | 0 | 1 |
| ARIA row-header query matches | 0 | 18 |
| ARIA column-header/cell query matches | 0 | 25 |
| Exported ARIA metadata records | 0 | **81** |
| Serialized extraction bytes | 93750 | 103570 |
| Query work | 37055 | 41387 |
| Walk work | 1475 | 5063 |

The81records comprise1table,18rowgroups,19rows,22cells,18rowheaders and3column
headers. Richer output costs9820additionalbytes; it is not described as free or
as a speed benchmark. Source metadata is now directly queryable and exportable
through the reader, rather than requiring the earlier full-DOM inspection.

Complete Chip, Memory and Electrical rows (readerrefs e295/e454/e917) retain the
same three text digests as the prior native full-DOM/reader concordance,2638text
units total. One source cell retains aria-colspan2 for the electrical row; the
chip and memory cells retain their independent one-column declarations. The
browser exposes the declarations; the API does not compute table associations.

Removing only `ariaTableSource` from extracted JSON content yields the same
before/after SHA256:
`aeee5b57b97b1ac2a8ad577a4369b9cdd4b90390b37843000159fd7e12294e76`.
Reader accounting metadata can differ because more attributes are retained;
whole-response byte equality is not claimed.

Before extraction: **12:37:36.838–12:37:36.983UTC**.
After extraction: **12:51:57.349–12:51:57.497UTC**.
One instrumented run each, not a performance comparison. Evidence:
`native-aria-table-reader-september13/RESULT.json`,43-entry ledger SHA256
`edda0536f506f296c3c3260bc9a277bc067081242eb67f20f439eaa206d43e13`.

## WHATWG retained regression

Original source: `https://html.spec.whatwg.org/multipage/tables.html`, captured
**September13,2026 12:16:17.507UTC**. Source SHA256 remains
`fb26736819aaa873821f4e0322a0e3c96b884737541f1956eea1739be058d0c4`.
New offline extraction: **12:51:57.671–12:51:57.888UTC**; one reader load,
zeroHTTP, three queries/341956work and10994walkwork.

**10816nodes,depth17,19headings,9tables,0column-groups** and all six admitted
heading-text hashes match the prior result. No byte rewriting, limit increase,
CSS, geometry, raster, actions or scripts. Evidence:
`native-whatwg-aria-regression-september13/RESULT.json`,23-entry ledger SHA256
`d477a8cee27ec7df962547e935c6cc4f093e693bfa4e71712208ff977940a59a`.

## Preserved failures and open gates

- baseline00 stops at strict compilation: one new test's object-spread type
  needs annotation; opportunistically selecting the previously unselected
  research-selector suite reveals13old union-narrowing errors. The new type is
  corrected; that unrelated suite remains outside the gate, with source and
  diagnostics preserved. No native cases run in baseline00.
- baseline01 records53new failures plus the three old assertions. fixed00
  exposes three CR round-trip regressions plus those same old assertions.
- baseline02 includes the9extra newline/budget cases;62new failures plus the
  three old failures. fixed01 resolves all108newcases; only the old3remain.
- Before-helper bytes are archived before adding the explicit known-failure
  after-phase policy. Neither previous source captures nor failed test receipts
  are rewritten. All three new reader processes exit0, source/runtime pins match,
  owners close, process groups end and empty private HOME/TMP directories vanish.

The full selected test suite is not green, and broader browser functionality,
real-site rendering/performance, benchmark/Astra/Poe research and hardware ranking
remain incomplete. Credential/passkey devices, SafeJS, real TTY, human challenge
handoff and CAPTCHA/access-control bypass are not established by these gates.
