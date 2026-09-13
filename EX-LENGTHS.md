# Native x-height lengths

## Metric and computation

`ex` lengths now use a real x-height basis. `nativeFontXHeight` derives the native
Agent Mono metric from the lowercase-x bitmap glyph, selected through the existing
font-weight matcher, and scales it by the font's units-per-em. The current regular
and bold faces both have five ink rows per eight font units. This is an engine
metric, not a universal definition of `ex` or an arbitrary `0.5em` substitution.
The native family has a usable lowercase-x glyph; missing-font fallback is not
implemented or claimed by this change.

`BoxFontMetrics.xHeight` is an optional explicit pixel basis alongside `fontSize`
and `rootFontSize`. Standalone `computeBoxStyle` calls with `ex` require it, even
when `fontSize` is supplied. Zero and fractional metrics work; invalid metrics and
overflow fail explicitly. Existing negative-value rules, border snapping, CSS-wide
defaulting and deferred percentage calculations stay in their consuming stages.

Supported paths include box/inset dimensions, margins, padding, borders, outlines,
flex lengths and gaps, scalar grid tracks and existing track functions, table
border spacing, font size, line height and text indentation. Existing math-enabled
consumers also accept `ex` leaves in `calc`, `min`, `max` and `clamp`, including
mixed `em`/`rem`/`ex`/percentage values. This does not add a new math grammar to
grid tracks, font size or line height where it was already unsupported.

Font size uses parent metrics, or initial metrics at the root. Line height and
indentation use the element's own resolved font. Inherited computed lengths do
not get re-resolved with a child's font; unitless line height keeps its existing
inheritance semantics. `computeTextIndent` accepts an optional fifth `xHeight`
pixel argument and requires it for `ex`, including math leaves.

Document styles request x-height only when a value actually uses `ex`. Absolute
and root-font-only lengths do not acquire unnecessary own-font dependencies.
Grid line names are not mistaken for dimensions. Existing cache invalidation
handles typography, stylesheet, custom-property and reparenting changes. Custom
property tokens resolve at the actual use site, rather than at their definition.

No runtime dependency, foreign browser, source rewrite or resource-cap increase
is introduced. The native capability list now includes `em`, `rem`, and `ex`.

## Source evidence

The prior native-only investigation in `ex-font-source-september13` read retained
CSS Values and Units Level4 HTML captured September11,2026. It established actual
x-height, conditional fallback, parent/initial exceptions for font-affecting
properties, own metrics for `ex` line height, computed-value inheritance and math
use-site context. It was not a fresh HTTP request or rendering comparison.

Original source SHA256:
`cfc594269a139eddc479ab65ac98267835b509ed43bcd392ffb4fc2ba1f07abf`.
Native clauses SHA256:
`d02a752b0fceb0eb1b1d34b3570b7fdf4f7e74524cc92055d3d55c6b64174dd7`.
Full external font selection, the other specifications linked by that source, and
general font-rendering conformance remain outside the verified source scope.

## Validation

Two canonical scalar/math padding tests first reproduce the real unsupported
formatting failure. Their unchanged pixel-and-hit references now pass. The final
focused snapshot passes910tests, including70new cases across three native test
files: two canonical,45shared/integration,23text. Coverage includes metric basis,
math, inheritance, ranges, lazy dependencies, mutations, geometry and raster.

One new test initially measured the wrong whole-value bound for text indentation;
the corrected fixture exceeds the existing limit including optional suffixes.
Its failed run remains preserved. A manifest-order preparation mismatch also
stopped before creating any broad gate; a new exact-manifest snapshot passed.
The pre-existing untracked font-relative test was restored to its original bytes
and is not bundled into this feature or claimed as executed validation.

The final clean gate passes **17,142 tests,0 failures,2 unchanged exclusions**:
331selected suites,330strict roots,709manifest entries (378 not run). Build,
strict type checking, formatting and source-stability checks pass in
`native-ex-length-september13-round01`, September13,2026,
02:19:40.415–02:23:46.874UTC. Its audit binds1233source/2056compiled files,
1219 unchanged tracked inputs and13owned files plus the manifest. Pre-existing
dirty work remains separate. No push.

Source inventory SHA256:
`60578408b9a0a9b3f04c94d6d1cb2ddc0f0e907fd850a115ea19b53b35039400`.
Compiled inventory SHA256:
`48a62b4aad3024532786beee1e53eb1a071f5b0c43639d2a97b9c6bc600ce1dc`.
Native result SHA256:
`290b27c28761c750fa0f11e7809343649126d4905d5b09f098a32bfce26ee702`.
Audit SHA256:
`12ddebc986dd296cb5835ec131a2bfe2525ce9173144d3063f94dded33258502`.

## Original SQLite replay

The unchanged original HTML/CSS replay passes September13 at
02:24:10.040–02:24:10.231UTC on the audited runtime. One parse,469DOM nodes,
one stylesheet installation and one formatting inspection make no HTTP, image,
used-layout, raster or script calls. The unsupported CSS-value count falls from
six to one: the font-family declaration remains. All15unsupported properties,
six selectors,eleven float flags and one overflow flag remain explicit. The
previously fixed HTML alignment flags stay absent.

Representative native computed values establish actual metric-dependent results:

| Original selector | Font size / x-height | Computed result |
| --- | --- | --- |
| `.button` | 14.4px /9px | `padding: 0px 9px` |
| `.rightsidebar` | 16px /10px | right padding10px; margins10px |
| `.menu ul li a` | 16px /10px | `padding: 7px 14px` |
| `.searchmenu` | 16px /10px | padding10px |

These are computed styles, not used geometry or a screenshot. Raw DOM records
and post-install presentation snapshots stay unchanged; revisions473→474→474
reflect only the expected stylesheet invalidation. Document/style/query owners
close, private HOME/TMP stay empty and source/compiled inventories remain exact.
The replay is **not a fresh website or whole-site layout pass**, and adds no host
to the historical86-host inventory. Float flags do not prove missing float code.

Replay result SHA256:
`9282dbda8b5b1cf930eb97dd6c593dd7cacfb6276a96a4b0a02aa3f80dfee859`.

## Remaining browser work

This feature does not establish a fresh website pass, used layout of SQLite,
script execution, credential-provider or passkey-device acceptance, SafeJS,
real TTY, or challenge/human-handoff behavior. The original research topics and
broader website/performance goal remain open. Subsequent compatibility work must
address the remaining real CSS limitations rather than suppress their diagnostics.
