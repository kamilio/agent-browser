# Native percentage table-cell widths

Automatic native tables now size cells with simple computed percentage `width`
values. The same path works with separate and resolved collapsed borders. The
captured Lua contents stylesheet's `td { width:15% }` exposed the previous blanket
rejection; this implementation fixes that class of native fixture, not all of
Lua's independent CSS and HTML-presentation limitations.

## Sizing policy

- `TableColumnContribution` gains optional `percentage` and `percentageOffset`.
  A percentage is a fraction: `0.5` means50%. The offset defaults to zero and
  represents horizontal content-box padding/borders. An offset without a
  percentage is invalid. Inputs must remain finite, nonnegative and bounded.
- The percentage base is assignable track width: table inner width minus outer
  and intercolumn spacing. A spanning cell's request subtracts its internal
  spacing before growing covered tracks. Border-box percentages add no offset;
  content-box percentages retain actual padding and resolved border widths.
- Intrinsic minima remain hard constraints. Percentage preferences are resolved
  in deterministic span/column order; a span's deficit is shared equally over
  covered tracks. If requests exceed available width, only growth above minima
  is compressed proportionally. Zero and over100% values are valid requests,
  not reasons to fabricate extra definite table width.
- After percentage preferences, nonpercentage tracks grow toward maximum
  content, then share excess. If every track has a percentage, all tracks share
  remaining excess. Existing nonpercentage allocation is unchanged.
- Auto intrinsic maximum retains ordinary content width, accounts for aggregate
  column maxima across rows, and inverts the strongest attained percentage
  preference for each span. Smaller duplicate percentages cannot unnecessarily
  inflate the width or cause overflow when a stronger request already suffices.
  Nonpercentage maximum content is also budgeted against the remaining fraction.
- The remaining-fraction calculation conservatively combines fraction and
  offset bounds for overlapping spans or differing offsets across rows. It is
  not a least-width solution for every combination. A nonpositive remainder is
  not divided into; extreme numeric requests can still fail with resource-limit.

This is a documented deterministic native automatic-table policy, not full CSS
Tables Level3 harmonization or a claim of pixel parity with another browser.
Original DOM attributes, stylesheet declarations and computed-style ownership
remain intact; no stylesheet is removed or rewritten to make a fixture pass.

## Retained limits

The existing4096-column,4096-contribution,4000000-work and layout-number bounds
remain. Allocation is bounded by the actual contributions/tracks, not an
unbounded dense grid. Work is charged through preference accumulation, sorting,
intrinsic calculation and final allocation. Frozen inputs and returned snapshots
retain their immutability.

Percentage min-width, percentage padding and heights, mixed percentage math,
root/row/group percentage sizing, positioned table roles and fixed table layout
retain their independent guards. HTML table width attributes are not newly
implemented. Cell max-width remains ignored, as already documented in
`TABLE-DOCUMENT-INTEGRATION.md`; original computed max-width remains observable.
Direct unnormalized structural consumers still reject percentage max-width.

## Verified evidence

Three new manifest-listed suites add53 cases:31 solver checks,21 document checks
and one unchanged before/after fixture. Coverage includes spans, unequal rows,
zero/overcommitted percentages, box sizing, nesting, wrapping, geometry, shared
border raster output, physical hit targets, mutation invalidation and a genuine
native link click using only mocked transport with owner cleanup.

The formatted baseline fixture fails at the old supported-profile guard. Exactly
the same bytes pass with this implementation, including actual100px cell
rectangles and hits. Fixture SHA256:
`93a97da51204bcd8abaa33d5697f9c38afb41821e45f8e854cac7c0f2b2015af`.

Focused result: **579 passed,0 failed across14 suites**. Final clean-source
regression: **11901 passed,0 failed,2 unchanged exclusions**, September12,2026,
04:51:59.602–04:54:30.664 UTC. Source build,215 strict roots, scoped formatting
and216 selected native suites pass.610 manifest entries are not610 executed
suites.1106 source files and1944 compiled files are audited;1098 non-owned tracked
inputs match the baseline commit, with the manifest checked separately.

The unchanged exclusions cover the total-host-object-ceiling pressure case and
the real-unsupported-display media case. The unrelated legacy grid rejection
in intrinsic-widths.test.ts is reproduced on clean source (96pass/1fail), left
unchanged and remains outside the established selected regression.

Earlier failed checks remain recorded: the initial fixture's formatter-only
line wrap, the obsolete percentage-width rejection updated to min-width, the
row-versus-table intercell-gap expectation, and the mistaken expectation that
cell max-width was guarded. The latter now has an explicit preservation test.
These are not hidden production fixes or additional exclusions.

Work lane: `node_modules/.cache/native-validation/table-percentage-work-september12`.
Gate: `node_modules/.cache/native-validation/native-table-percentage-september12-round01`.

- Source ledger: `e212ee5d3c7ecfdcc82ed69e2e28f9569b2e41c20f18b4a4fbf4ed3a668958d7`
- Compiled ledger: `8acb255db90a057ecdeaa44d60b194330bfa375d3ece491f411d1fe049958ac4`
- Native results: `e627b7343374ef9851808107dcdb0c5d1ae9d1baae0a725644d49bd07b7e78ea`
- Summary: `de78affe02713d824000f18b41e867d377c7b00eaa75fa85e9b35144d7635250`
- Audit: `32afae80eeb85d0610ac668c29a7cf48be848e3f6b8effe8b74f4699ebb2d540`
-20-entry receipts: `164e5df5c3c522db6c210f85c3fe4216f1d27a1fd19d5c661059436284d40bdc`

## Separate website acceptance

The Lua captured page has not been retested on this release. Its previously
recorded failed click is unchanged until a new scoped check establishes otherwise.
The fresh zlib resource-budget flow uses the earlier11784 release, not this one;
see `ZLIB-RESOURCE-BUDGET-FLOW.md`. Native tests do not establish credential,
passkey-device, real SafeJS/TTY, fingerprinting or challenge-bypass acceptance.
