# IANA native CSS targets — September 12, 2026

**Completed static diagnosis, not a repaired website.** A separate bounded native
parser traversal of the exact IANA stylesheet identifies concrete compatibility
targets behind the aggregate diagnostics in `IANA-SVG-NATIVE-CHECK.md`. No HTTP,
Session, navigation, formatting or used-layout operation occurs in this static
lane. Which individual rules match the page remains unknown.

## Concrete targets

- Text: `a:link, a:visited { text-decoration: none }`, `h5 { text-decoration:
  underline }` and `i, em { font-style: italic }`. Whole-sheet diagnostics include
  28 `text-decoration` and four `font-style` declarations.
- Generated content and pseudo-elements: legacy `:before`/`:after`, `::selection`,
  `::placeholder` and vendor search-decoration selectors. Twenty `content`
  declarations are a separate property-support issue.
- SVG CSS paint: nine `fill`, two `stroke`, two `stroke-width`, one
  `stroke-linecap` and one `stroke-linejoin` diagnostic. This overlaps the genuine
  inline-paint problem isolated in SQLite's captured SVG, but does not establish
  which IANA declarations are active or that its successfully decoded logo fails.
- Other presentation: 54 `border-radius`, 26 `opacity`, 25 `cursor`, 20
  `box-shadow`, 18 `transition`, 15 `transform` and seven `letter-spacing`
  diagnostics. Background gradients/images/combinations and nine `vertical-align`
  values (`super`, fractional em and pixel offsets) also need investigation.
- Global rules: six `@font-face` and three `@keyframes` account for all nine
  at-rule diagnostics. These require real supported semantics, not blanket
  acceptance, deletion or suppression to make layout appear successful.

These are **raw whole-sheet counts**, not the earlier 43 applicable property
diagnostics and not proof of winning cascade values. Individually supported
background tokens may participate in an unsupported combination.

## Selector classification and provenance

The native parser counts 878 rules and 2,228 declarations and returns 798
qualified rules. A separate syntax validation of previously recorded candidates
finds 763 syntactically accepted selectors and 35 unsupported pseudo-element
rules. Three unsupported rules have inactive media at 1280×720, consistent with
the live page's 32 selector diagnostics. Matching against the DOM is not tested.

Important: the retained `TARGETS.json.rejectedSelectors` field contains false
results from the **single-selector** support API, not genuine stylesheet syntax
rejections. It includes 101 valid comma lists. Use `SELECTOR-VALIDATION.json` for
the corrected distinction; original evidence is not rewritten. Basic tag/list
selectors are not broken merely because that narrower probe returns false.

The exact 88,658-byte body decodes to 88,644 UTF-16 code units without an observed
BOM/newline transformation. Native-generated declaration helpers receive separate
provenance; they are not assigned fabricated response spans. The successful
census and syntax classification use 472,547 of 2,000,000 wrapper work units,
26,689 excerpt bytes and 256,722 of 262,144 JSON bytes. No caps are raised.

Evidence: `node_modules/.cache/native-validation/website-svg-work-september12/iana-css-static-diagnostics/`.
The census runs at 23:02:51 UTC on September 12, 2026; classification at 23:04:12.
Its 41-entry sealed ledger, exact extracts, counts, runtime/corpus identities and
preserved failed diagnostic lanes pass Main's read-only verification. No native
test suite or live page is rerun. Earlier observer/setup/serialization failures
remain failed evidence, not successful compatibility measurements.

Next implementation priority: bounded SVG CSS paint cascade, then independently
validated sizing/stroke/clipping and concrete text/layout support. Native float,
flex and table coordinators already exist; their formatting markers alone do not
prove those engines absent. The overall browser goal remains open.
