# Native clear behavior without floats

September 11, 2026.

The native formatting tree previously rejected every non-none `clear` value,
even when no float existed to require clearance. This prevented normal native
geometry and pointer actions in otherwise supported documents. The unchanged
Test Pages capture also records four such clear warnings alongside its separate
table, overflow and CSS limitations.

## Behavior

The formatting traversal retains actual computed clear declarations and counts
their clearance dependencies. It emits `clear-layout-not-supported` only after
traversal finds a non-none float, preserving the existing float guard and clear
counts in that unsupported profile. Traversal order does not let an earlier or
later float evade admission checks.

This implements the no-float case, not general float layout. It does not remove
CSS declarations, clear arbitrary diagnostics, implement float exclusions or
claim that a supported float's clearance can be ignored. Display-none, unmatched
and overridden float declarations do not create rendered float dependencies.
Visibility-hidden floats remain layout-active and retain the existing guard.
Other unsupported formatting/CSS issues remain independent.

Tests check physical/logical clear values, CSSOM preservation, geometry, pixels,
hit ownership, empty-block margin collapse, float appearance/removal, traversal
order and independent overflow/CSS failures. A BrowserSession fixture genuinely
clicks a checkbox inside a cleared block and verifies the full native gesture and
checked state; it does not substitute direct checked-state assignment.

## Verification

- The new fourteen-case baseline retains3 passes/11 failures on clean
  `128636ee0ee113fc0af9170b7a50c46c7908f34d`.
- The focused seven-file candidate passes341 cases. Independent source review
  finds no concrete newly admitted float-clearance counterexample under the
  current float-unsupported profile; this is not a browser-parity claim.
- The final clean-base gate passes **9,677 tests, zero failures, two existing
  exclusions**, with162 selected files,161 strict roots and566 manifest entries.
  Build, strict TypeScript and formatting pass.
- Audit verifies1,040 unchanged tracked inputs, four owned source/test files,
  one manifest addition,1,045 source inputs and1,876 compiled artifacts. Existing
  dirty styles/index/parser work and two unrelated manifest additions are absent.
- A first candidate had copied a pre-existing untracked `css-flow.test.ts` into
  its snapshot. It is retained but not released. Both temporary edits to that
  working file were reversed exactly; the corrected final snapshot excludes it.
  The tracked `flow-core.test.ts` supplies the CSSOM regression instead.
- The unchanged exclusions concern the separate total host-object ceiling and
  real unsupported-display-alongside-advisory-media tests. Strict roots retain
  the existing snapshot-test omission. No missing gate is reclassified as passed.

Final gate UTC **19:55:24.603–19:57:34.573**, audited **19:58:25.102**.
Evidence: `node_modules/.cache/native-validation/native-clear-layout-integration-september11-round02/`.
Earlier snapshots and exact untracked-file restoration proof remain in
`node_modules/.cache/native-validation/clear-layout-work-september11/`.

- Source inventory: `0d275c96134fca10f26f1bd92af279842c9a17fce46af185fbecb8f3f9a5be50`.
- Compiled inventory: `d3f817afe42132825b2d67b3146ee74c9c599a66e3bc594e4982a10008f61b45`.
- Native result: `38bd416b9f414a5c372e90c68f965fcd6f3ad76564f2c885b92806793d77ef8e`.
- Gate summary: `6408e0e25d6b4c0f9f0b73460a4f266099889de0d76bc70eb348e1798e6b9a7a`.

These are native fixtures. The separately recorded fresh W3C visit uses the
earlier9614 build and still fails on five table elements. Captured-page replay,
native table layout, resource-policy support and broader website interactions
remain separate work. No CAPTCHA, live-site, credential or runtime acceptance
claim follows from this change.

## Unchanged-capture follow-up

`TESTPAGES-CLEAR-REPLAY.md` verifies the committed 9677-build against the original
two HTML/CSS captures, with two native/mock responses and zero wire requests.
Clear warnings fall from four to zero with no active floats. A bounded native
sample still reports `clear:both` on e2606; it is not a complete enumeration of
all four formerly warned nodes. SVG and numeric-marker metadata remain intact.
The actual checkbox click still fails the independent formatting-profile guard.
Parent verifies all 55 evidence checks, both ledgers, exact capture hashes and
zero cleanup state. This is partial captured-site progress, not page acceptance.
