# Native table CSS computation helper

The later parent document integration and isolated gate results are recorded in
`TABLE-DOCUMENT-INTEGRATION.md`. Worker handoff statements below describe the
earlier authoring scope, not the final parent validation status.

September 11, 2026. Parent baseline `5597d73` resolves to
`5597d739ca3642101bf10e9bf457d01c96ed404d`.

`src/css-table.ts` provides property recognition, declaration/value parsing,
frozen initial values and computed table styles. The subsequent scoped style
integration connects these properties to the native cascade and CSSOM. It adds
no dependencies or rendering implementation. The parent owns formatting/layout
wiring and isolated validation.

## Supported values

| Property | Values | Initial | Inherited |
| --- | --- | --- | --- |
| `table-layout` | `auto`, `fixed` | `auto` | No |
| `border-collapse` | `separate`, `collapse` | `separate` | Yes |
| `border-spacing` | One or two nonnegative lengths | `0px` | Yes |
| `caption-side` | `top`, `bottom` | `top` | Yes |
| `empty-cells` | `show`, `hide` | `show` | Yes |
| `vertical-align` | `baseline`, `top`, `middle`, `bottom` | `baseline` | No |

All six accept `initial`, `inherit`, `unset` and `revert`. Property names use
the existing lowercase declaration API convention; values normalize case and
surrounding whitespace. Spacing parsing retains one or two normalized components;
computation always returns horizontal and vertical absolute pixel lengths,
including the frozen initial `0px 0px`. A single component sets both axes.

Spacing reuses `parseBoxDeclarations` with nonnegative padding lengths and
`computeBoxStyle` for absolute, `em`/`rem`, viewport and supported
`calc`/`min`/`max`/`clamp` conversion. Unitless zero is accepted. Percentages,
including zero percentages anywhere in math, negative raw lengths, nonzero
unitless numbers, malformed dimensions and extra components are rejected.
Negative math results clamp to zero through the existing box computation rules.
No viewport or font metrics are fabricated. Missing required font bases and
nonfinite computation fail through the existing box/math errors; explicitly
supplied invalid font metrics also fail when spacing is inherited.

## Computation and ownership

`computeTableStyle(specified, parent, viewport, fonts?, defaults?)` expects
parsed specified/default values and an already computed parent. Optional
per-element UA presentation defaults apply only to absent or `revert` values,
before normal inheritance or initial fallback. Explicit `initial`, `inherit`
and `unset` bypass these defaults. A default spacing length is resolved using
the element's actual metrics; inherited spacing is copied without resolving
the parent's font or viewport units again. Computed spacing remains available
even when `border-collapse` is `collapse`; this helper does not decide used layout.

Returned styles are frozen. An equal frozen parent retains identity; a mutable
parent is neither returned nor frozen in place. Inputs are not modified.
Source size is checked against `cssMathLimits.maxSourceCodeUnits` before
normalization. The existing component splitter and math parser enforce depth,
node and argument limits, without a new parser or unbounded regular expression.

## Limits and validation status

The vertical alignment subset deliberately excludes `sub`, `super`, `text-top`,
`text-bottom`, percentages and length offsets. Parsing nonbaseline alignment is
not evidence of supported inline alignment: the parent must retain explicit
unsupported-formatting guards for inline contexts it cannot lay out. This helper
does not claim full inline alignment, collapsed-border rendering or table layout.

`src/css-table.test.ts` contains native helper tests for parsing, conversion,
inheritance, UA defaults, identity/immutability, invalid inputs, metric failures,
overflow and bounded resources. `src/table-styles.test.ts` adds standalone native
cascade, inline/computed property, variable, font/viewport/cache, namespace and
UA-default cases. No tests, builds, gates, network access or browser/SafeJS probes
were executed by this worker. No pass is claimed; the parent owns isolated
validation and test-manifest registration. Formatting/layout code, manifests,
historical evidence and `TASKS.md` remain outside this worker's edits.

## Scoped style integration

The six longhands participate in stylesheet and inline parsing, `all`, existing
custom-property substitution, and sorted computed-property enumeration. The
existing CSSOM machinery exposes hyphenated and camel-case accessors without
new property aliases. Reading a table computed property calls the lazy
`DocumentStyles.table(id)` getter, not layout.

The style owner collects winning specified values during cascade refresh and
computes inherited table styles on demand, walking ancestors iteratively.
Only local spacing that actually uses `em` or `rem` requests the corresponding
element or root text metrics. Inherited spacing retains its already computed
pixels. Revision refresh and close clear specified/computed table caches alongside
the existing style families; viewport changes use the existing revision mechanism.

HTML `table` elements receive a UA spacing default of `2px`, while CSS initial
spacing remains `0px`. HTML `thead`, `tbody` and `tfoot` default to middle vertical
alignment, and HTML `tr`, `td` and `th` default to explicit inherited alignment.
These defaults apply only to absent/revert declarations, not explicit
initial/unset/inherit. The style owner also assigns the missing header-group,
footer-group, caption, column and column-group HTML displays. Foreign namespace
elements and ordinary elements with author-assigned table displays receive no
HTML-only hints.

HTML `td`/`th` receive `1px` UA padding on each side, and `th` receives centered
text. These defaults are seeded only for absent/revert winning values, leaving
author longhands, shorthand expansion, importance, variables and explicit
initial/unset/inherit semantics intact. Data-cell alignment still inherits
normally. The defaults are namespace-aware and are not applied to foreign
elements or ordinary elements styled as cells.

**Header bold limitation:** the current text-style model has no `font-weight`
property or bold-font rendering path. This lane does not silently emulate bold
with unrelated style changes or extend the out-of-scope text/rendering modules.
Header centering and padding are implemented; default header bold remains an
explicit outstanding limitation for the parent.

Table style computation remains independent of an element's display, so an
HTML table changed to `display:block` and its ordinary block descendants retain
computed inherited table values for the parent's anonymous-wrapper handling.
This does not itself create or lay out anonymous wrappers. HTML presentation
attribute guards remain the parent's responsibility.

The integration baseline and exact worker-only patch are retained under
`node_modules/.cache/native-validation/table-document-work-september11/style-integration-css-worker/`.
Pre-existing dirty production files were saved before editing together with
their clean HEAD versions; the delta is relative to the saved working versions,
not a whole-file replacement from HEAD. Nothing was staged or committed.
