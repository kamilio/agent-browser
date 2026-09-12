# BusyBox compatibility diagnosis — September 12, 2026

This is a separate **source-only diagnostic**, not another live visit or a
successful documentation flow. The sealed live result remains in
`BUSYBOX-DOCUMENTATION-FLOW.md`: the genuine About-link click failed.

## Exact captured source

One parse of the original 249,489-byte homepage uses committed native12254,
`722c101fe567d59dabb4ab1db11e22a2f18c0892`. The captured HTML SHA256 is
`1027545b603f291070247f4f6272556a9538ad224860cfe2b2be4f8ff39d904b`.
The sole stylesheet is the 374-code-unit inline style element `e11`, SHA256
`bf0defddf2335418f733499d147bc5be2b9af3413189e0449b3c73711e995889`.
No external stylesheet, images, geometry, session, mock, navigation or HTTP runs.

The three raw CSS diagnostics are unsupported font-family lists, not font-size
percentages. Each exact declaration independently produces one invalid-value
diagnostic and no accepted declaration. Offsets are half-open code-unit ranges
within that stylesheet, not arbitrary substring matches against the whole HTML:

| Rule | Exact declaration | Range | Matching elements |
| --- | --- | --- | --- |
| `body` | `font-family: lucida, helvetica, arial` | `[74,111)` | 1 |
| `td.c2` | `font-family: arial, helvetica, sans-serif` | `[250,291)` | 0 |
| `td.c1` | `font-family: lucida, helvetica` | `[321,351)` | 1 |

This explains raw/applicable CSS counts of three/two without discarding or
rewriting source. Accepting family syntax alone would not implement font
selection or establish typography/geometry parity; no guard is removed here.

## Independent HTML limitations

Nine elements carry unsupported presentation attributes: two tables with
`border`, three images with `border`, two cells with `valign`, one table with
percentage `width`, and one cell with percentage `width`. The first two tables
also carry `cellpadding`/`cellspacing`, producing separate table-hint diagnostics.
Three tables retain the independent unsupported-display guard.

The source-only build has 1505 DOM nodes and 1782 formatting nodes. Although that
formatting-node count matches the live census, this build additionally defers
three unloaded images: six deferred boxes instead of the live run's three.
It is therefore not an equivalent full-image replay or sole-cause attribution.

## Verification and follow-up

Child UTC: 2026-09-12T07:39:28.094Z–2026-09-12T07:39:28.155Z.
Supervisor UTC: 2026-09-12T07:39:27.996Z–2026-09-12T07:39:28.163Z; exit0.
The supervisor verifies20 gate receipts,1124 source and1944 compiled ledger
entries before launching with kernel socket/socketpair denial, private HOME/TMP
and process/network/runtime guards. Document/query owners close; guard attempts
are empty. Evidence is retained in
`node_modules/.cache/native-validation/inline-clearance-work-september12/busybox-source-probe`;
the probe script SHA256 is
`3c817a27bee56648dc97f7d53b01a328cdf53f666f58cf41f0466d681ac2c0e1`.

Future work must distinguish font fallback policy, HTML presentation hints and
table coordination, with regression tests before any live acceptance claim.
No code changes follow from this diagnosis. The attempted-host count remains75;
historical reports, research completeness and provider/device/TTY/realSafeJS/
challenge acceptance remain unchanged.
