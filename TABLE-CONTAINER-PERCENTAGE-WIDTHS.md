# Native percentage table container widths

## Root cause and correction

The current captured man7 flow reached a genuine date(1) click but failed with
`Percentage table role sizing requires cycle resolution`. Its applicable CSS
issue set was empty; the three remaining table shells required native layout
coordination. MAN7-OWNER-RETEST-SEPTEMBER-14.md preserves that observation.

The native width coordinator already measures table intrinsic minima, resolves
the authored width against the finite containing block, and supplies the actual
used content width to the table layout helper. A later role guard nevertheless
rejected the original percentage-valued **container width** unless a caption
wrapper existed. The correction removes that inconsistent caption requirement
for the container's width, not the guard for every percentage or table role.

This reuses the existing real width, column, text, row, geometry and raster
algorithms. There is no new parser-only acceptance, fabricated rectangle,
exception swallowing, forced click or bypass of formatting validation. The
exported helper's caller-resolved `contentWidth` contract is unchanged; it does
not independently reinterpret the authored width after a caller supplies the
used size. Invalid finite-size inputs and insufficient column widths still fail.

## Established behavior

New native cases prove actual uncaptioned percentage table widths, including
zero, fractional and greater-than-100% requests and existing percentage length
math. They check the containing **content** box rather than the viewport or
padding box, intrinsic cell minima, fixed-length min/max constraints, nested
tables, percentage cells and auto-width intrinsic fallback.

- Explicit widths and offsets, following-flow positions, actual RGBA pixels,
  hit owners and fixed-pixel reference fixtures cover separate/collapsed borders,
  content/border sizing, padding, spacing and margins.
- Width-only changes wrap deterministic native text from one line to three,
  changing natural row/table height and following flow. Line positions, glyph
  bounds, pixels and hits update; earlier raster snapshots remain unchanged.
- Tables inside float-, flex- and grid-allocated blocks resolve against their
  assigned width and recompute after that allocation changes.
- Ordinary BrowserSession clicks on discovered anchors dispatch real native
  mouse events and navigate through in-memory transport. Canceled, hidden and
  covered targets retain their controls. No geometry or hit-test stubs are used.

Unresolved percentage row/group widths, percentage min/max sizes and heights,
restricted cell percentage math, fixed table layout and unsupported positioned
roles retain their existing guards. Direct uncaptioned floated tables and tables
used directly as flex/grid items remain unsupported; testing a table **inside**
an allocated block does not establish those separate profiles. This is not full
CSS table conformance or a browser-wide performance claim.

## Validation — September 14, 2026

The clean candidate excludes all pre-existing dirty work. Tests use the explicit
native manifest, existing compiler/formatter/test runner, private environment
and kernel/JavaScript guards. No dependency, live website, socket, TTY, SafeJS,
credential/provider/passkey or device probe is added.

| Check | Actual result |
| --- | --- |
| red00 | Build stops with missing installed Bun type resolution; no native tests run. Existing dependency symlinks are then supplied; no package is installed. |
| red01 | Build, strict and format pass; 15 negative/limit cases pass and all 21 positive cases fail at the exact percentage role guard. |
| green00 | The same 36 layout cases pass after the production correction. |
| focused00 | 534 pass across 15 files before review additions. |
| release00 | Earlier full profile passes with 57 new cases; its original snapshot remains unchanged. |
| focused01 | 542 pass across 15 files, including eight review-driven reflow/allocation cases. |
| controls01 | 329 pass: all 65 new cases plus 264 distinct existing control cases. |
| release01 | **23,822 pass, zero fail, two unchanged exclusions**, 480 selected files and 479 strict roots; build and format pass. |

Final release01 runs **14:36:44.290–14:43:16.674 UTC**; its native interval is
14:37:06.953–14:43:16.410 UTC. Source inventories remain stable at 2,936 files,
with 2,200 compiled files. Supplemental controls use byte-identical source and
compiled inventories. These elapsed intervals are validation records, not a
speed comparison. The profile does not execute every manifest entry or close
unrelated acceptance gates.

The audit accounts for **23,757 unchanged baseline case occurrences**, including
the two exclusions, **two explicitly migrated existing cases**, and **65 new
passing cases**. The migrations replace obsolete root-percentage rejection with
real width/offset/equivalence assertions while keeping row/group rejections.
Neither migration is counted as a new case. Supplemental coverage gives
**24,086 unique passing occurrences**.

The unchanged exclusions are the total host-object ceiling case and the
advisory-media/real-unsupported-display case. Earlier failures and earlier
passing snapshots remain evidence of their own inputs, not substitutes for
final validation.

Independent source review identifies no concrete production regression. Its
natural-height reflow and alternate-allocation coverage gaps are addressed by
the eight additional tests and the final validation. System-required W3C lookup
attempts supplied no usable content; no external conformance/source proof is
claimed from them.

## Evidence and remaining acceptance

Original lane:
`/dev/shm/agent-browser-table-container-percentage-september14/`.
The final `release01/AUDIT.json` binds results, case migrations, owned candidate
bytes, unchanged base files, source/compiled inventories and supplemental cases.
REVIEW.md, REVIEW-RESOLUTION.md and VALIDATION-NOTES.md preserve review and run
history. Adoption verifies committed files against this audited snapshot and
preserves original dirty tracked/untracked work. No push is included.

A separately scoped captured man7 recheck is prepared but **not proved by these
native cases**. It must use the adopted audited runtime and retain its original
four responses, ordinary native click, optional tracker denial and no-wire
boundary. Its missing destination capture remains an independent limitation.
Broader live-site coverage, original research, password/passkey/device and
challenge-handling acceptance remain open in TASKS.md.
