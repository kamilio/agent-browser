# GnuPG CSS compatibility diagnosis — September 12, 2026

This is a **source-only diagnostic**, not a new website visit, full-image replay
or successful FAQ interaction. The failed captured flow in
`GNUPG-CLEAR-APPLICABILITY-REPLAY.md` remains unchanged.

## Bounded native observation

Committed native12350 (`607251ac70e165f7c84a6696b6d95d370d5c778f`) parses one
original captured HTML document and attaches its exact external stylesheet.
There is no session, navigation, click, mock, HTTP, image decoding, formatting
build or geometry query. HTML/CSS SHA256 values remain:

- `cff89f6b754a9c593bfff6c4f6d1f15c68cba9ab434a4e81796b94625225b438`
- `48233e2b7bd1f22cca5f901465a95ff7fb8d9bb80f862378d8530b2fa422863b`

The native parser retains124 rules. Of35 rules carrying declaration diagnostics,
ten have current DOM matches,23 have none,and two have unknown match counts
because their pseudo-element selectors are unsupported. Unknown is recorded as
null,not zero. Selector match counts do not replace authoritative CSS diagnostic
applicability,which may account for states differently.

Raw/applicable totals remain invalid values7/2, unsupported properties43/14 and
unsupported selectors2/2. The following candidate groups have observed matches:

| Selector group | Current matches | Declaration diagnostic counts |
| --- | ---: | --- |
| `body` | 1 | 1 invalid value |
| `h1, h2, h3` | 3 | 1 invalid value;2 unsupported properties |
| `a:link` | 58 | 1 unsupported property |
| `nav a:visited, a:link` | 58 | 1 unsupported property |
| `.topmenuitem` | 5 | 1 unsupported property |
| `nav ul` | 6 | 3 unsupported properties |
| `nav ul li a, ul li ul.sub-menu li a` | 31 | 1 unsupported property |
| `#nav_bottom ul` | 1 | 1 unsupported property |
| `#nav_bottom a` | 6 | 1 unsupported property |
| `div#content` | 1 | 1 unsupported property |

The unknown selectors are `.morelink:after` and `#tagcloudlist li:before`.
Their absence cannot be inferred from the failed selector queries.

## Implementation priorities, not guard suppression

Inspection of those captured rule bodies identifies font-family lists,
font-variant,letter-spacing,text-decoration,list-style shorthand,box-shadow and
border-radius as distinct unsupported features. Generated content and its
pseudo-element selectors are another independent concern. This is not a
sole-cause ranking or a claim that one small patch makes GnuPG work.

For example,the native list implementation already supports marker type and
position longhands,while the captured navigation/footer rules use the rejected
`list-style:none` shorthand. Regression-backed shorthand expansion is a concrete
next candidate; unsupported image markers and other syntax must remain explicit.
Font fallback,decorations,spacing,shadows/radii and generated content require
their own semantic and rendering work rather than dropping declarations.

## Evidence and limits

Child UTC: 2026-09-12T08:07:02.679Z–2026-09-12T08:07:02.716Z.
Supervisor UTC: 2026-09-12T08:07:02.581Z–2026-09-12T08:07:02.727Z; exit0.
The supervisor verifies20 gate receipts,1127 source and1944 compiled ledger
entries. Kernel socket/socketpair denial, private HOME/TMP and process/network/
runtime guards remain active; document/query owners close and guard attempts
are empty. Evidence is retained in
`node_modules/.cache/native-validation/center-element-work-september12/gnupg-css-source-probe`.
Probe SHA256:
`0c8cbbcbf2759d0ce3e90c71e07dac89e57ad1d7999abfb77714cabd42218887`.

There is no new host or changed live outcome. The inventory remains75 attempted
hosts; broader research,provider/device/TTY/realSafeJS/challenge gates stay open.
