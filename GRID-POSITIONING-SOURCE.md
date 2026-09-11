# Native Grid positioning source — September 11, 2026

## Source interpretation

`section-1.jsonl` and `section-2.jsonl` below are native extractions of the
actually observed Grid §9.1 and §9.2 headings, respectively.

- **Containing-block establishment:** §9.1 is conditional on the Grid container
  generating the absolute containing block. Its example uses `position: relative`
  to establish that block. These sections do not provide a complete establishment
  test; Grid parenting is not evidence that the parent is the containing block.
- **When §9.1 applies:** Grid placement determines the containing area. An `auto`
  Grid edge uses the corresponding padding edge, not auto-placement; overflowing
  containers use scrollable-area padding edges. Physical insets offset inward
  from the resulting containing block. Nonexistent Grid lines become `auto`
  rather than expanding the grid.
- **When the Grid parent is not the containing block:** §9.2 still excludes its
  absolute child from Grid placement and track sizing. The hypothetical static
  position treats it as the sole item in an area bounded by the parent's content
  edges, affected by `justify-self`/`align-self`. This does not assign the parent
  as its actual containing block.
- **Insets versus static position:** the sections distinguish physical offsets
  from hypothetical static position; they do not give the complete rules deciding
  when automatic insets use that position.

## Application to the measured MDN boundary

`MDN-POSITIONED-GRID.md` identifies `e74` (`ul.a11y-menu`) as one absolute block
child of static Grid body `e72`, with all Grid placement longhands `auto`, physical
top `-320px`, left/right `2px`, bottom `auto`. These are measured computed styles,
not used geometry. The actual containing block was not measured.

**Implementation interpretation:** do not substitute the body's padding box for
actual containing-block selection merely because it is a Grid parent. A static
computed position alone is not an exhaustive containing-block-establishment test.
If this parent does not establish the actual block, its §9.2 parenting rules still
apply, but §9.1's containing-area construction must not be applied to it by
assumption. Keep `e74` out of track sizing. Its explicit top/left/right require
physical-inset handling against the correctly selected block; all-auto *Grid
placement* is not equivalent to all-auto *physical insets* and does not establish
that static position should determine its coordinates.

**External source gaps:** §9.1 links containing-block terminology to CSS Display
and inset properties to CSS Positioned Layout Level 3. §9.2 links static position
to CSS2's absolute non-replaced-width rules. Those linked rules were not extracted
or fetched. Full ancestor/initial containing-block selection, other establishment
triggers, when auto insets invoke static position, used-size equations and
over-constraint resolution therefore remain outside this source check. No
existing native positioning implementation, parent fix or MDN geometry is
declared conformant by this report.

## Exact receipts

New lane:
`node_modules/.cache/native-validation/native-grid-positioning-source-september11/`.

| Section | Observed heading | Receipt | Bytes | SHA-256 |
| --- | --- | --- | --- | --- |
| 9.1 With a Grid Container as Containing Block | `e8610` | `section-1.jsonl` | 15,563 | `f7a078e7124f0246431cc4a17cb943eb92a06c6ab77e31beafd61dac084b042f` |
| 9.2 With a Grid Container as Parent | `e8794` | `section-2.jsonl` | 5,522 | `cec8496c38f2d65c01a6351ddb67dba0f79693ffcb510d0f03a80592a2d6ace1` |

Observed selectors, retained in `SELECTIONS.json` and section input/audit receipts:

- §9.1: `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(316)`.
- §9.2: `html:root:nth-child(1) > body:nth-child(2) > main:nth-child(7) > h3:nth-child(325)`.

Original body pin:
`53a47980a217f0b976e1ab8fa0b56944421f7e6311deef96a6aa591ddc693317`, 957,488 bytes.
Original candidate receipt pin:
`0a2aef81b62ae9374751b9de76c96ae4167606997aed0c1daa0597ac8a11212d`.
Immutable compiled inventory pin:
`d737c0d571b69ce5c6a1162757ff24c3d4bbde14c448983915f356848f9c09b9`.

## Execution and boundaries

One offline child ran **14:51:58.918–14:51:59.527 UTC**, exited zero, and its
process group is absent. Exactly two native `extractResearchReplayJson` calls
selected one observed heading apiece, returning partial semantic
`extracted-unverified` receipts. No native navigation, wire requests, guard or
process attempts occurred. Every extracted document closed to zero nodes and
temporary private directories were empty and removed.

The original 30-second timeout plus five-second grace, 6 MiB output/file cap,
seccomp/network/process guards, `long-v1` admission and separate omitted-raw reader
policy remain unchanged. No retries or raw-HTML fallback occurred. The historical
6805-pass reader build was reused, not rebuilt or revalidated as a new test run.
Its 1006 source and 1788 compiled files retain their pins. Prior source evidence
and the MDN diagnosis report retain their original hashes.

Only this report and the new private lane were written. No captures or build
trees were duplicated; no production, tests, TASKS, manifests or commits changed.
`VERIFICATION.json` binds this report and the source receipts;
`RECEIPTS.sha256` covers the new lane artifacts.
