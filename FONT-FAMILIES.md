# Native font-family lists and fallback

The native browser preserves the requested computed font-family list and selects
the available Agent Mono bitmap font independently. It does not claim that
Verdana, Arial or other requested system fonts are installed.

## Supported profile

- Comma-separated quoted names and unquoted identifier sequences. Named families
  retain case and significant quoted whitespace; unquoted identifiers join with
  one space. Comments and CSS escapes are handled without splitting quoted commas.
- Eleven generic keywords: serif, sans-serif, monospace, cursive, fantasy,
  system-ui, math, ui-serif, ui-sans-serif, ui-monospace and ui-rounded. Every generic
  maps to the single available native face. This is not visual fidelity to each
  category. A quoted generic is an ordinary name, not a generic alias.
- Ordered matching: skip unavailable named families, then choose Agent Mono by
  case-insensitive name or a supported generic. If none matches, use Agent Mono
  as the explicit default fallback. Validate the entire list before selecting.
- Normal inheritance, initial/inherit/unset/revert, author priority, inline styles,
  custom-property use sites and style invalidation. Computed styles retain the
  requested list rather than replacing it with the selected face.
- Text advance/ascent/descent and font-size, line-height, indentation and box ex
  dependencies resolve the same available font. Font-size ex uses parent/initial
  font selection; other ex values use the element's own computed font selection.

`src/font-family.ts` exposes `parseFontFamily`, `normalizeFontFamily` and
`resolveNativeFont`. The resolver returns the actual bitmap font, the matched
family (or null for default fallback), and a named/generic/fallback discriminator.
Standalone resolver and metric callers must provide a valid computed family list,
not an unresolved CSS-wide keyword. Invalid direct input throws unsupported.

Both input and semantic canonical output are bounded to 4096 UTF-16 code units,
with at most 64 families. Normalization quotes named families and escapes string
contents; it is a bounded semantic representation, not a claim of complete CSSOM
serialization compatibility. Unknown available-font status does not make valid
family syntax fail CSS.supports.

## Limitations

No font downloading, @font-face, operating-system font discovery, shaping engine,
new glyph coverage or external runtime dependency is introduced. Generic category
fidelity, generic(...) functions, font shorthand, font-style and revert-layer are
outside this change. Bare fangsong is a named family, not a generic keyword in
this profile. Existing missing-glyph behavior remains unchanged. Unterminated
comments/strings are rejected rather than applying CSS parser EOF recovery.

CSS Fonts 4 retained-source native extraction distinguishes computed lists,
ordered family matching, first-available-font metrics and generic aliases.
The original source lane passed its checks. A subsequent grammar extraction
retained useful complete clauses but exited 1 because it mistakenly included
volatile /proc/self/status among immutable receipts; that failure is preserved,
not relabeled as a successful source run. Neither run proves complete CSS Syntax,
CSSOM or platform-font conformance. Both use the September 11 retained response,
not fresh website traffic.

## Validation — September 13, 2026

Clean selected gate: **17,263 passed, zero failed, two unchanged exclusions**.
There are 334 selected suites, 333 strict roots and 712 manifest entries; 378
entries were not run. Build, strict typing, formatting and immutable source
checks pass. The audit binds 1,237 source files, 2,060 compiled files and 1,218
unchanged tracked inputs. Evidence lane:
`node_modules/.cache/native-validation/native-font-family-september13-round01/`.

New tests: 99 parser/matcher cases, 20 style integration cases and two canonical
rendering cases. The latter reproduce the old formatting guard failures and pass
unchanged after the fix, including layout, geometry, raster, hit testing, ex
padding and cleanup. Final focused selection passes 792 cases in 19 suites.
The first broad run failed one old expectation that font-size keywords cannot
be family names; the corrected test preserves rejection on other text properties.
That failed run remains in round00 and is not the release gate.

The retained original SQLite HTML/CSS replay removes the last CSS-value failure.
Four native queries retain the computed `"Verdana", sans-serif` list, select
Agent Mono through the generic and preserve the actual 9/10px x-height metrics.
Remaining formatting issues are 15 CSS properties, six selectors, eleven float
flags and one overflow flag; flags alone do not prove the float engine absent.
The replay has zero HTTP, image, used-layout, raster or script calls. It validates
this compatibility improvement, not whole-site rendering or new live coverage.
Source DOM, post-install presentation and runtime inventories stay unchanged;
document/style/query owners close. Evidence:
`node_modules/.cache/native-validation/font-family-work-september13/sqlite-replay00/`.
