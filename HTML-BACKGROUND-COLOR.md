# HTML background-color hints and collapsed cell backgrounds

## Implemented behavior

Native HTML `bgcolor` now supplies a low-specificity `background-color`
presentation hint on body, table, thead, tbody, tfoot, tr, td, th and marquee.
The helper is HTML-namespace only. Existing author styles, inline styles,
important declarations, shorthand resets and mutations retain their cascade
behavior; source attributes and DOM structure are not rewritten.

The implementation follows the complete legacy color conversion, not merely
the two hexadecimal colors in Libpng. It uses the existing named-color table,
ASCII-only keyword matching, short hex conversion, astral replacement before
the standard 128-character normalization limit, and legacy channel reduction.
An originally empty value and transparent keyword supply no hint; whitespace
alone becomes black. Non-CSS legacy input is intentionally not parsed as CSS.

Attribute work is charged before parsing against the existing style budget.
Normalization intermediates are bounded; there is no new arbitrary input cap,
dependency, browser engine, resource request or credential access.

Other table hints such as cellpadding, cellspacing, rules, frame and background
keep their existing guards. No bgcolor support is added to col, colgroup or
arbitrary/foreign elements. Existing column handling and static marquee
fallback remain; this change does not implement marquee movement or assert
complete marquee rendering semantics.

## Paint-order repair

Testing exposed an existing CSS defect: with collapsed borders, a later row
background covered an earlier cell spanning that row. Both equivalent CSS and
new HTML hints reproduced it; separate-border mode already passed.

Collapsed cell backgrounds now follow their own table's structural backgrounds
and precede the existing collapsed-border phase. Original order breaks ties;
unrelated table owners are not globally promoted. The shared ordering feeds
rasterization and hit testing, so the spanning cell also remains the hit target.
Geometry, border ownership and content-group ordering are unchanged. Documents
without collapsed tables retain the original sorting comparator. No overall
browser-speed improvement is claimed without a separate benchmark.

## Verification

| Check | Result |
| --- | --- |
| Focused native suites | 891 passed, 0 failed across 18 suites |
| New cases | 184: 119 parser/role, 62 integration, 3 canonical |
| Full explicit native gate | 13226 passed, 0 failed, 2 unchanged exclusions |
| Selected suites / strict roots / manifest | 253 / 252 / 647 |
| Source / compiled files | 1148 / 1964 |
| Unchanged tracked inputs | 1140 |

Full-gate UTC on September 12, 2026: **2026-09-12T11:39:05.200Z through
2026-09-12T11:41:48.275Z**. Build, strict checking, formatting and the explicit
native suite pass under kernel socket/socketpair denial. The gate and its
20-receipt ledger are at `node_modules/.cache/native-validation/native-html-background-color-september12-round00`; commit-to-snapshot proof is recorded
separately in its `COMMIT-VERIFICATION.json` for eight owned snapshot inputs.
Pre-existing uncommitted work is excluded and preserved.

The final byte-identical canonical fixture fails on the old 13042 runtime:
one separate-border CSS control passes, while the HTML row hint fails width
resolution and collapsed CSS rowspan fails its red-pixel assertion. All three
pass after the repair. Integration coverage also checks layered backgrounds,
spans, empty rows, mutations, style-owner replacement, limits, read-only state,
and one exact in-memory native anchor activation—not a live website click.

Preserved history: original baseline 0/1; initial focused run 883/6; expanded
baseline 1/2; fixed01 and fixed02 891/0. Five initial failures were new fixture
oracles (two legacy-color values, col and marquee guard assumptions, optional
GET method); the remaining failure revealed the real collapsed paint bug.
Neither the red-pixel assertion nor unrelated production guards were weakened.
Both static reviews found no actionable issues; they are not runtime evidence.
Detailed original receipts remain in the private work lane's VALIDATION-NOTES.md.

## Primary evidence and limits

The committed 13042 native browser transport fetched the WHATWG common
microsyntax and rendering pages once each, with public-address/TLS checks,
one allowed HTTPS origin, redirects forbidden and no scripts or subresources.
Two HTTP200 responses total 74440 encoded / 487849 decoded bytes; transport
closes. The native parser extracted the relevant algorithm and element roles
offline. Exact headers, bodies, hashes and invocation are retained under
`node_modules/.cache/native-validation/html-background-color-work-september12/spec/`.
Sources: `https://html.spec.whatwg.org/multipage/common-microsyntaxes.html`
and `https://html.spec.whatwg.org/multipage/rendering.html`.

This addresses the bgcolor family identified in the earlier Libpng census,
not every retained HTML/layout guard. Full Libpng navigation, new live-site
acceptance on this release, performance/research completion, credentials,
providers/passkeys/devices, TTY, real SafeJS and challenge handling remain
separate outstanding gates. Existing historical reports and measurements
retain their original bytes and paths.
