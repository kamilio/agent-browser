# Native HTML table cell spacing

HTML `table[cellspacing]` now supplies a zero-specificity author presentational
hint for both axes of `border-spacing`. This implements the attribute through
the existing native style, table layout, raster and hit-testing paths; it does
not discard page markup or substitute a separate renderer.

## Behavior and limits

- Nonnegative integer-prefix parsing accepts ASCII leading whitespace, an
  optional plus sign, trailing suffixes, and negative zero. Negative nonzero or
  missing digits supply no hint. Missing/invalid attributes leave the normal
  cascade and inherited/UA values in force.
- Author rules, inline declarations, importance, variables and CSS-wide values
  retain their existing cascade behavior. Invalid author CSS still retains its
  independent diagnostic; the HTML hint does not suppress it.
- Only the HTML table attribute receives this mapping. Foreign namespaces and
  unrelated table-part attributes retain their original unsupported guards.
  Computed spacing on non-table displays and collapsed borders continues through
  existing used-layout applicability rules, not a new universal gap rule.
- The raw UTF-16 attribute length plus one is charged once per table before
  parsing, including invalid or overridden hints. Integer precision, style work,
  geometry magnitude, layout, raster and hit-testing limits remain enforced.
- `html-pixel-length.ts` shares the previous integer algorithm without changing
  `cellPaddingLength`'s exported alias or cell ownership rules. The precision
  error keeps code `resource-limit` and now names the shared HTML pixel length.

No table width/border/rules/frame/alignment, font fallback, overflow, image
decoding or CSP policy support is added by this change. There are no dependency,
SafeJS, credential-provider, passkey-device, TTY or network changes.

## Source and website motivation

The unchanged Hacker News capture contains four `cellspacing="0"` tables,
identified in `HN-MODERN-NATIVE-DIAGNOSIS.md`. Its separate font, overflow,
legacy presentation and image-policy problems remain. Passing the following
native fixtures does not establish Hacker News layout or website acceptance.

Main's one offline native source parse ran September12 at
18:56:24.164–18:56:24.324 UTC against the earlier captured WHATWG rendering page.
It built14970nodes and retained seven bounded paragraphs. Native node5528 under
15.3.8 Tables establishes the attribute-to-border-spacing mapping; nodes526/536
establish zero-specificity author hints and nonnegative-integer pixel parsing.
The already captured integer algorithm is documented separately in
`HTML-CELLPADDING-INVESTIGATION.md`. No new HTTP request was made for this source
extraction, and the broad alignment matches do not establish table valign rules.

Source body:366253bytes, SHA256
`d7b02615f70194b29caf5daaac20432cf2c540806636146539036a4c52d4173e`.
New extraction is
`html-cell-spacing-work-september12/source00/EXTRACTED.json`, SHA256
`f3b3f16bd0711604901c890087f563603377e85344b1053d591bc114ea1525df`.
The parse stays within30000nodes/depth256/2MiBtext/2Mquerywork/32paragraphs/
64KiBoutput limits, closes its owners and preserves source/release bytes.

## Regression evidence

The two canonical new cases first failed on clean native15421, computing the
unchanged UA2px spacing rather than the requested0px/5px. With the fix they pass
independent literal cell coordinates, CSS-control geometry, raster equality,
gap/cell hit identity and unchanged DOM snapshots.

The separate worker contributes99cases: standards/quirks and nested tables,
six-cell coordinates, cascade, namespace/display eligibility, fixed/percentage
widths, heights, border-collapse, borders/cellpadding, mutation/cache invalidation,
prepared-raster staleness, input charging, precision/magnitude and work bounds.
Its final round01 passes567/567 across seven suites, with strict TypeScript and
formatting. Round00's three incorrect test oracles and one test-only TypeScript
option error are retained; they did not require a production change or cap rise.

Main's first fixed round passed375/376: the sole failure was an older test that
deliberately expected cellspacing to be unsupported. Four affected legacy test
files now preserve remaining `rules`/frame/background guards and explicitly
verify that invalid cellspacing does not break existing padding/background.
The final focused run passes637/637 across ten suites at
19:09:11.555–19:09:42.678 UTC. These superseded expectations and failed lanes are
preserved; they are not retrospectively reported as passing.

## Clean native gate

`node_modules/.cache/native-validation/native-html-cell-spacing-september12-round00/`
runs September12 at19:11:03.315–19:14:35.433 UTC:

| Check | Actual result |
| --- | --- |
| Native tests | 15522passed,0failed,2unchanged documented exclusions |
| New cases | 101:2canonical+99worker |
| Selected native suites / strict roots | 297 / 296 |
| Clean explicit manifest | 675entries |
| Source / compiled inventories | 1184 / 1996files |
| Unchanged tracked inputs | 1173 |
| Build, strict TypeScript, owned formatting | All pass |

Source inventories match before/after. The clean candidate excludes unrelated
working-tree changes, including the pre-existing styles reorder and three extra
manifest entries. Historical reports and measurements retain their paths.

- Audit SHA256: `6475a4021ea5a9298e52986065c4aa9b5085909891f8bd704ff7667ab6da5f48`.
- Source ledger: `9de0b7be99c8a865e5ed685746367ee0b839e184053a82e6faf8b951fc11eb4c`.
- Compiled ledger: `fca133ee16cbc500f3a40f3cd51eb1782ea698f53d70d228ce9c0f33725e2d7c`.
- Twenty gate receipts: `7faf56677d23fdf2e52eb0804e0502da5f8d4418c40ca1b769d4b75bd258422a`.

This isolated native gate is not live-site, socket, real TTY, SafeJS,
credential-provider, authenticator-device, performance or challenge acceptance.
The overall browser goal and those outstanding gates remain in `TASKS.md`.
