# Native computed display for floats

The native style engine applies the captured CSS2.2 §9.7 display adjustment to
non-positioned floated elements. `FLOAT-FORMATTING-SOURCE.md` preserves the
primary native source extraction and its exact table.

- Floating `inline-table` computes to `table`.
- Floating `inline`, `inline-block`, and the captured table-internal display
  values compute to `block`.
- Other captured values retain their display; not every float becomes `block`.
- Existing absolute/fixed precedence still computes float to `none`. Specified
  declarations, priorities and their CSSOM values are not rewritten.
- Computed inheritance, cascade and subsequent attribute, stylesheet and CSSOM
  mutations observe the adjusted display. Previously returned snapshots stay
  immutable.

This is a computation fix, not float placement or a website rendering pass.
The full native float/clear/overflow layout gates remain in place. Boxless
`contents`, modern multi-keyword/inline-flex/inline-grid float mappings and
float applicability to flex/grid items are not expanded by this CSS2.2 change.
Existing item/position blockification is preserved separately. Full source-order
placement, text/block/height coordination and paint/hit ownership remain pending.

## Regression evidence

The standalone public-API fixture in `src/float-display-computation.test.ts`
fails on otherwise unchanged clean `d8506c9d2fcd2c90e3514b2e82490852c20161a7`:
the floated span resolves `inline` rather than `block`. The initial baseline
ran September12,2026,00:52:08.029–00:52:09.361 UTC, with one failure and1081
unchanged tracked inputs. The exact fixture is retained byte-for-byte.

With the fix,63 new checks across that fixture and `src/float-display.test.ts`
pass. The focused sealed run passes590 checks in16 explicit manifest-listed,
present suites with zero failures/exclusions,00:56:32.838–00:56:41.262 UTC.
It covers detailed mappings, inheritance, priorities, mutation/position
transitions, authored/computed separation and retained layout guard failures.

The full sealed `native-float-display-september12-round01` gate passes build,
strict checks, formatting and11331 selected native tests, with zero failures
and the same2 previously documented exclusions. It runs197 selected suites,
196 strict roots and593 clean manifest entries,00:56:50.642–00:59:11.574 UTC.
Parent audit verifies1080 unchanged tracked inputs,1084 source files and1924
compiled files. Only the20-line styles addition, two new tests and their manifest
entries are owned; pre-existing dirty styles changes are excluded and preserved.
Two legacy grid assertions still fail in the separately documented clean-HEAD
extended runs; this is not an all-repository test pass.

Private evidence: `node_modules/.cache/native-validation/float-integration-work-september12/`.
Isolated checks establish no live website, provider/credential, real SafeJS,
device/TTY, operating-system integration or challenge-solving acceptance.
