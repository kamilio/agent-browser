# Native stylesheet-boundary and incomplete-rule recovery

The native CSS scanner recognizes stylesheet-boundary `<!--` and `-->` tokens.
They are not treated as an HTML comment block: intervening text still enters the
CSS parser. Markers inside strings, selectors, declarations and nested rule
groups are not stripped. Fresh imported stylesheets have their own top-level
context, independently of import recursion depth.

An incomplete qualified-rule prelude that reaches EOF without a block and without
a scanner-reported lexical fault now emits `discarded-incomplete-css-rule`.
The exact formatting-prefixed diagnostic is advisory, allowing earlier valid
rules to produce geometry while retaining the diagnostic in raw/applicable CSS
and formatting metrics. This is not a blanket suppression of invalid CSS.

Semicolon/closing-brace recovery, unknown at-rules, unterminated strings/comments,
missing closing rule braces, unsupported declarations and unsupported selectors
retain their independent diagnostics and guards. Rule/declaration, source/work,
import and recursion budgets are not increased. Import discovery and actual rule
parsing use the same boundary handling so resolver offsets remain aligned;
markers cannot make a late import early again. Source DOM text stays unchanged.

## Captured problem

The zlib document captured on September 12, 2026 contains one 76-code-unit style
element, native ref `e11`, with one valid `P { margin-bottom: 0em }` rule followed
by a legacy marker-wrapped URL. A socket-denied source-only diagnosis at
05:03:38.267–05:03:38.292 UTC retained that rule but reported the old global
`unimplemented-or-invalid-css-rule` for the tail. No page session, mock transport,
navigation or new HTTP request ran during that diagnosis.

Captured decoded HTML SHA256:
`a2654af9cc15e4943a11c8aa27ce378f7293230d2953f18609fca7485b9423a5`.
Exact native style text SHA256:
`e8ac137f7bb4a21a549ea940b9b42531b85d4e2d8f466d8e6045118b2bda6ea8`.

The regression fixture retains those exact style bytes, with a separate bounded
fixture stylesheet and two paragraphs. The unchanged fixture fails against the
previous parser at its width-profile guard, then passes with recovery: actual
paragraph positions, red raster pixels, physical hit target, retained diagnostic,
unchanged source text and document cleanup are checked. This fixture is not the
full zlib page: its independent HTML presentation, center and table guards are
not solved by this CSS change.

## Coverage and remaining gates

Three suites add 51 cases: 34 parser/import cases, 16 layout/interaction cases
and one unchanged before/after fixture. Coverage includes repeated markers,
trivia/BOM boundaries, nested media/supports contexts, imported sheet offsets,
late imports, lexical faults, exact advisory matching, retained unsupported
profiles, viewport and stylesheet invalidation, immutable diagnostic snapshots,
geometry, raster, hits and a genuine native checkbox click through an in-memory
document and imported stylesheets, with owner cleanup.

The old focused fixture fails 0/1; the final focused selection passes 580/0 with
one unchanged media exclusion. These checks use a clean-source snapshot, pinned
Node 22.22.0, private HOME/TMP and kernel socket denial. No credentials, provider,
passkey device, TTY, real SafeJS, alternate browser or challenge bypass is used.

The clean-source release gate passes **11952 tests, 0 failures and 2 unchanged
exclusions** across 219 selected suites, September 12, 2026,
05:14:31.399–05:17:00.783 UTC. Source compilation, 218 strict test roots and scoped
formatting pass. There are 613 clean manifest entries, not 613 executed suites.
The exclusions remain the total-host-object-ceiling pressure case and the
real-unsupported-display media case. Source inventories are unchanged before and
after validation; 1109 source and 1944 compiled files are audited, with 1102
non-owned tracked inputs matching the base commit. The dirty parser's original
unrelated changes remain outside this patch.

Evidence lane:
`node_modules/.cache/native-validation/native-css-rule-recovery-september12-round01`.
Source ledger SHA256:
`b233012cf69936b17532e2e1eb05c67d68040a7e19140bcd0980fa471fc5fb5d`.
Compiled ledger SHA256:
`3ad037b3f204ad8c8fc4e30781dc5e4dfa8ad5348f89de1dae812c4610c6abee`.
Native results SHA256:
`a12338882fc6fbeec22cab26d3609374dfd12af36422b13a5f98bb9f96ad0742`.
Audit SHA256:
`576a66b716609193eb9b219911bd8fd71fe2790e3891f468e66280765db3bec6`.
Gate receipts SHA256:
`3acb93382d3b404b4b958fea4e796d976bdd7f1de661ef46bdfc4a6e159433d0`.

Full captured-site replay and fresh live behavior are separate acceptance gates.
Neither the historical zlib click failure nor another site's outcome is
retroactively changed by a passing regression fixture. This is a bounded native
recovery feature, not a claim of complete CSS Syntax conformance or browser parity.
